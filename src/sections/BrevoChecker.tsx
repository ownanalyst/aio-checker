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
  Mail,
  Play,
  Download,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  BarChart3,
  Copy,
  Key,
  TrendingUp,
  TrendingDown,
  Zap,
  Users,
  CreditCard,
  Send,
  Square
} from 'lucide-react';
import { toast } from 'sonner';

interface BrevoAccount {
  id: string;
  apiKey: string;
  status: 'pending' | 'checking' | 'valid' | 'invalid';
  accountName?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  plan?: string;
  credits?: number;
  creditsUsed?: number;
  smsCredits?: number;
  contactsLimit?: number;
  contactsCount?: number;
  campaignsCount?: number;
  verified?: boolean;
  createdAt?: string;
  error?: string;
}

export default function BrevoChecker() {
  const [accounts, setAccounts] = useState<BrevoAccount[]>(() => {
    const saved = sessionStorage.getItem('brevo_accounts');
    return saved ? JSON.parse(saved) : [];
  });
  const [bulkInput, setBulkInput] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    sessionStorage.setItem('brevo_accounts', JSON.stringify(accounts));
  }, [accounts]);

  const parseBulkInput = () => {
    const lines = bulkInput.trim().split('\n').filter(l => l.trim());
    const newAccounts: BrevoAccount[] = [];
    let skipped = 0;

    lines.forEach((line, index) => {
      const apiKey = line.trim();
      if (apiKey && (apiKey.startsWith('xkeysib-') || apiKey.length > 20)) {
        newAccounts.push({
          id: `brevo-${Date.now()}-${index}`,
          apiKey: apiKey,
          status: 'pending'
        });
      } else {
        skipped++;
      }
    });

    if (skipped > 0) {
      toast.warning(`${skipped} line(s) skipped — format: xkeysib-xxxxxxx`);
    }

    setAccounts(prev => [...prev, ...newAccounts]);
    setBulkInput('');
    if (newAccounts.length > 0) {
      toast.success(`Added ${newAccounts.length} Brevo API key(s)`);
    }
  };

  const checkBrevo = async (account: BrevoAccount) => {
    setAccounts(prev => prev.map(a =>
      a.id === account.id ? { ...a, status: 'checking' } : a
    ));

    try {
      const response = await fetch('/api/proxy/brevo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: account.apiKey }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Invalid API key');
      }

      const accountRes = result.results?.[0];
      if (!accountRes?.ok) {
        throw new Error(accountRes?.data?.message || 'Invalid API key');
      }

      const accountData = accountRes.data;

      setAccounts(prev => prev.map(a =>
        a.id === account.id ? {
          ...a,
          status: 'valid',
          companyName: accountData.company_name || '',
          email: accountData.email || '',
          firstName: accountData.firstname || '',
          lastName: accountData.lastname || '',
          plan: accountData.plan_type || 'Unknown',
          credits: accountData.credits?.email ?? 0,
          creditsUsed: accountData.credits?.msmk ?? 0,
          smsCredits: accountData.credits?.sms ?? 0,
          contactsLimit: accountData.contacts?.limit ?? 0,
          contactsCount: accountData.contacts?.count ?? 0,
          campaignsCount: accountData.campaigns?.count ?? 0,
          verified: accountData.email_verified ?? false,
          createdAt: accountData.created_at || '',
        } : a
      ));

      toast.success(`Brevo API key verified: ${account.apiKey.substring(0, 16)}...`);
    } catch (error: any) {
      const message = error.message || 'Invalid API key';
      setAccounts(prev => prev.map(a =>
        a.id === account.id ? {
          ...a,
          status: 'invalid',
          error: message
        } : a
      ));
      toast.error(`Brevo: ${message.substring(0, 80)}`);
    }
  };

  const checkAll = async () => {
    const pending = accounts.filter(a => a.status === 'pending');
    if (pending.length === 0) {
      toast.info('No pending API keys to check');
      return;
    }

    abortRef.current = new AbortController();
    setIsChecking(true);
    setProgress(0);

    for (let i = 0; i < pending.length; i++) {
      if (abortRef.current.signal.aborted) break;
      await checkBrevo(pending[i]);
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
    sessionStorage.removeItem('brevo_accounts');
    toast.info('All API keys cleared');
  };

  const exportResults = () => {
    const data = accounts.map(a => ({
      apiKey: a.apiKey,
      accountName: a.accountName || '',
      email: a.email || '',
      firstName: a.firstName || '',
      lastName: a.lastName || '',
      companyName: a.companyName || '',
      status: a.status,
      plan: a.plan || '',
      credits: a.credits || '',
      creditsUsed: a.creditsUsed || '',
      smsCredits: a.smsCredits || '',
      contactsLimit: a.contactsLimit || '',
      contactsCount: a.contactsCount || '',
      campaignsCount: a.campaignsCount || '',
      verified: a.verified ? 'Yes' : 'No',
      createdAt: a.createdAt || '',
      error: a.error || ''
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
    a.download = `brevo-check-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Results exported');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'valid':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/50"><CheckCircle className="w-3 h-3 mr-1" /> Valid</Badge>;
      case 'invalid':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/50"><XCircle className="w-3 h-3 mr-1" /> Invalid</Badge>;
      case 'checking':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Checking</Badge>;
      default:
        return <Badge variant="outline" className="border-slate-600 text-slate-400">Pending</Badge>;
    }
  };

  const validCount = accounts.filter(a => a.status === 'valid').length;
  const invalidCount = accounts.filter(a => a.status === 'invalid').length;
  const totalCredits = accounts
    .filter(a => a.status === 'valid' && a.credits)
    .reduce((sum, a) => sum + ((a.credits || 0) - (a.creditsUsed || 0)), 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-800/60 border-slate-700/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Total API Keys</p>
                  <p className="text-2xl font-bold text-white">{accounts.length}</p>
                </div>
                <Key className="w-8 h-8 text-indigo-400" />
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
                  <p className="text-slate-400 text-sm">Remaining Credits</p>
                  <p className="text-2xl font-bold text-emerald-400">{totalCredits.toLocaleString()}</p>
                </div>
                <Zap className="w-8 h-8 text-emerald-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Input Section */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500 rounded-lg">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-white">Brevo (Sendinblue) API Key Checker</CardTitle>
              <CardDescription className="text-slate-400">
                Verify API keys and fetch account details, credits, contacts, and campaigns
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-slate-300">Bulk API Keys (one per line, starting with xkeysib-)</Label>
            <Textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder="xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-xxxx&#10;xkeysib-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy-yyyy"
              className="mt-1 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 min-h-[120px]"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={parseBulkInput} className="bg-indigo-600 hover:bg-indigo-700">
              <Key className="w-4 h-4 mr-2" />
              Add API Keys
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
              Results ({accounts.length} API keys)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">API Key</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Account</TableHead>
                    <TableHead className="text-slate-400">Plan</TableHead>
                    <TableHead className="text-slate-400">Credits</TableHead>
                    <TableHead className="text-slate-400">Contacts</TableHead>
                    <TableHead className="text-slate-400">Campaigns</TableHead>
                    <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id} className="border-slate-700">
                      <TableCell className="font-mono text-slate-300">
                        {account.apiKey.substring(0, 20)}...
                      </TableCell>
                      <TableCell>{getStatusBadge(account.status)}</TableCell>
                      <TableCell>
                        {account.accountName && (
                          <div className="space-y-1">
                            <div className="text-slate-300 text-sm">{account.accountName}</div>
                            <div className="text-slate-500 text-xs">{account.email}</div>
                            <div className="text-slate-600 text-xs">{account.firstName} {account.lastName}</div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {account.plan && (
                          <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/50">
                            <CreditCard className="w-3 h-3 mr-1" />
                            {account.plan}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {account.credits !== undefined && (
                          <div className="space-y-1">
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50">
                              <Zap className="w-3 h-3 mr-1" />
                              {(account.credits - (account.creditsUsed || 0)).toLocaleString()} / {account.credits?.toLocaleString()}
                            </Badge>
                            {account.smsCredits !== undefined && account.smsCredits > 0 && (
                              <div className="text-xs text-slate-500">
                                SMS: {account.smsCredits} credits
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {account.contactsLimit !== undefined && (
                          <div className="space-y-1">
                            <Badge variant="outline" className="border-slate-600 text-slate-400">
                              <Users className="w-3 h-3 mr-1" />
                              {account.contactsCount?.toLocaleString()} / {account.contactsLimit?.toLocaleString()}
                            </Badge>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {account.campaignsCount !== undefined && (
                          <Badge variant="outline" className="border-slate-600 text-slate-400">
                            <Send className="w-3 h-3 mr-1" />
                            {account.campaignsCount} campaigns
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => checkBrevo(account)}
                            disabled={account.status === 'checking'}
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(account.apiKey);
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
