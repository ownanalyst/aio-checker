import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  MessageSquare,
  Play,
  Download,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  DollarSign,
  Phone,
  BarChart3,
  Copy,
  Wallet,
  TrendingUp,
  TrendingDown,
  Square
} from 'lucide-react';
import { toast } from 'sonner';

interface TwilioAccount {
  id: string;
  accountSid: string;
  authToken: string;
  status: 'pending' | 'checking' | 'valid' | 'invalid';
  balance?: number;
  currency?: string;
  accountName?: string;
  accountStatus?: string;
  accountType?: string;
  phoneNumbers?: string[];
  error?: string;
}

export default function TwilioChecker() {
  const [accounts, setAccounts] = useState<TwilioAccount[]>(() => {
    const saved = sessionStorage.getItem('twilio_accounts');
    return saved ? JSON.parse(saved) : [];
  });
  const [bulkInput, setBulkInput] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    sessionStorage.setItem('twilio_accounts', JSON.stringify(accounts));
  }, [accounts]);

  const parseBulkInput = () => {
    const lines = bulkInput.trim().split('\n').filter(l => l.trim());
    const newAccounts: TwilioAccount[] = [];
    let skipped = 0;

    lines.forEach((line, index) => {
      const parts = line.split(/[|,\s]+/).filter(Boolean);
      if (parts.length >= 2) {
        newAccounts.push({
          id: `twilio-${Date.now()}-${index}`,
          accountSid: parts[0].trim(),
          authToken: parts[1].trim(),
          status: 'pending'
        });
      } else {
        skipped++;
      }
    });

    if (skipped > 0) {
      toast.warning(`${skipped} line(s) skipped — format: accountSid|authToken`);
    }

    setAccounts(prev => [...prev, ...newAccounts]);
    setBulkInput('');
    if (newAccounts.length > 0) {
      toast.success(`Added ${newAccounts.length} Twilio account(s)`);
    }
  };

  const checkTwilio = async (account: TwilioAccount) => {
    setAccounts(prev =>
      prev.map(a => a.id === account.id ? { ...a, status: 'checking' } : a)
    );

    try {
      const response = await fetch('/api/proxy/twilio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountSid: account.accountSid,
          authToken: account.authToken,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Authentication failed');
      }

      const accountRes = result.results?.find((r: any) => r.endpoint.includes('Accounts') && !r.endpoint.includes('Balance') && !r.endpoint.includes('PhoneNumbers'));
      const balanceRes = result.results?.find((r: any) => r.endpoint.includes('Balance'));
      const phoneRes = result.results?.find((r: any) => r.endpoint.includes('PhoneNumbers'));

      if (!accountRes?.ok) {
        const errMsg = accountRes?.data?.message || 'Authentication failed';
        throw new Error(errMsg);
      }

      const accountData = accountRes.data;
      const balanceData = balanceRes?.ok ? balanceRes.data : null;
      const phoneData = phoneRes?.ok ? phoneRes.data : null;

      setAccounts(prev => prev.map(a =>
        a.id === account.id ? {
          ...a,
          status: 'valid',
          accountName: accountData.friendly_name,
          accountStatus: accountData.status,
          accountType: accountData.type,
          balance: balanceData ? parseFloat(balanceData.balance) : undefined,
          currency: balanceData?.currency || 'USD',
          phoneNumbers: phoneData?.incoming_phone_numbers?.map((p: any) => p.phone_number) || [],
        } : a
      ));

      toast.success(`Twilio verified: ${accountData.friendly_name}`);
    } catch (error: any) {
      setAccounts(prev => prev.map(a =>
        a.id === account.id ? { ...a, status: 'invalid', error: error.message } : a
      ));
      toast.error(`Twilio: ${error.message.substring(0, 80)}`);
    }
  };

  const checkAll = async () => {
    const pending = accounts.filter(a => a.status === 'pending');
    if (pending.length === 0) {
      toast.info('No pending accounts to check');
      return;
    }

    abortRef.current = new AbortController();
    setIsChecking(true);
    setProgress(0);

    for (let i = 0; i < pending.length; i++) {
      if (abortRef.current.signal.aborted) break;
      await checkTwilio(pending[i]);
      setProgress(((i + 1) / pending.length) * 100);
    }

    setIsChecking(false);
    abortRef.current = null;
    toast.success('Bulk check completed');
  };

  const stopCheck = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      setIsChecking(false);
      toast.info('Check stopped');
    }
  };

  const clearAll = () => {
    stopCheck();
    setAccounts([]);
    sessionStorage.removeItem('twilio_accounts');
    toast.info('All accounts cleared');
  };

  const exportResults = () => {
    if (accounts.length === 0) {
      toast.info('No data to export');
      return;
    }

    const data = accounts.map(a => ({
      accountSid: a.accountSid,
      accountName: a.accountName || '',
      accountType: a.accountType || '',
      status: a.status,
      accountStatus: a.accountStatus || '',
      balance: a.balance ?? '',
      currency: a.currency || '',
      phoneNumbers: a.phoneNumbers?.join('; ') || '',
      error: a.error || '',
    }));

    const csv = [
      Object.keys(data[0]).join(','),
      ...data.map(row =>
        Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twilio-accounts-check-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Results exported');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'valid':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/50"><CheckCircle className="w-3 h-3 mr-1" />Valid</Badge>;
      case 'invalid':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/50"><XCircle className="w-3 h-3 mr-1" />Invalid</Badge>;
      case 'checking':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Checking</Badge>;
      default:
        return <Badge variant="outline" className="border-slate-600 text-slate-400">Pending</Badge>;
    }
  };

  const totalBalance = accounts
    .filter(a => a.status === 'valid' && a.balance != null)
    .reduce((sum, a) => sum + (a.balance || 0), 0);

  const validCount = accounts.filter(a => a.status === 'valid').length;
  const invalidCount = accounts.filter(a => a.status === 'invalid').length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-800/60 border-slate-700/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Total Accounts</p>
                  <p className="text-2xl font-bold text-white">{accounts.length}</p>
                </div>
                <Wallet className="w-8 h-8 text-indigo-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/60 border-slate-700/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Valid</p>
                  <p className="text-2xl font-bold text-green-400">{validCount}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/60 border-slate-700/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Invalid</p>
                  <p className="text-2xl font-bold text-red-400">{invalidCount}</p>
                </div>
                <TrendingDown className="w-8 h-8 text-red-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/60 border-slate-700/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Total Balance</p>
                  <p className="text-2xl font-bold text-emerald-400">${totalBalance.toFixed(2)}</p>
                </div>
                <DollarSign className="w-8 h-8 text-emerald-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Input Section */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-500 rounded-lg">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-white">Twilio Balance Checker</CardTitle>
              <CardDescription className="text-slate-400">
                Check account balance, status, type and associated phone numbers
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-slate-300">Bulk Accounts (format: accountSid|authToken)</Label>
            <Textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder={`ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx|your_auth_token_here\nACyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy|another_auth_token`}
              className="mt-1 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 min-h-[120px]"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={parseBulkInput} className="bg-indigo-600 hover:bg-indigo-700">
              <Wallet className="w-4 h-4 mr-2" />
              Add Accounts
            </Button>
            <Button onClick={checkAll} disabled={isChecking} className="bg-green-600 hover:bg-green-700">
              {isChecking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Check All
            </Button>
            {isChecking && (
              <Button onClick={stopCheck} className="bg-red-600 hover:bg-red-700">
                <Square className="w-4 h-4 mr-2" />
                Stop
              </Button>
            )}
            <Button onClick={clearAll} variant="destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All
            </Button>
            <Button onClick={exportResults} variant="outline" className="border-slate-600">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>

          {isChecking && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-slate-400 text-center">{Math.round(progress)}% complete</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Table */}
      {accounts.length > 0 && (
        <Card className="bg-slate-800/60 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Results ({accounts.length} accounts)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">Account SID</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Account Name</TableHead>
                    <TableHead className="text-slate-400">Balance</TableHead>
                    <TableHead className="text-slate-400">Account Status</TableHead>
                    <TableHead className="text-slate-400">Phone Numbers</TableHead>
                    <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id} className="border-slate-700">
                      <TableCell className="font-mono text-slate-300">
                        {account.accountSid.substring(0, 20)}...
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(account.status)}
                        {account.error && (
                          <p className="text-xs text-red-400 mt-1 max-w-[180px] break-words">{account.error}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-300">
                        <div>{account.accountName || '-'}</div>
                        {account.accountType && (
                          <div className="text-xs text-slate-500">{account.accountType}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {account.balance !== undefined ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50">
                            <DollarSign className="w-3 h-3 mr-1" />
                            {account.balance.toFixed(2)} {account.currency}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {account.accountStatus && (
                          <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50">
                            {account.accountStatus}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {account.phoneNumbers && account.phoneNumbers.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {account.phoneNumbers.map((num, i) => (
                              <Badge key={i} variant="outline" className="border-slate-600 text-slate-400 text-xs">
                                <Phone className="w-3 h-3 mr-1" />
                                {num}
                              </Badge>
                            ))}
                          </div>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => checkTwilio(account)}
                            disabled={account.status === 'checking'}
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(`${account.accountSid}|${account.authToken}`);
                              toast.success('Copied to clipboard');
                            }}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
