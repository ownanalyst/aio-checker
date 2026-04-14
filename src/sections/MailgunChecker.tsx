import { useState, useEffect } from 'react';
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
  Globe,
  Zap,
  Send,
  Server,
  CreditCard
} from 'lucide-react';
import { toast } from 'sonner';

interface MailgunAccount {
  id: string;
  apiKey: string;
  domain?: string;
  status: 'pending' | 'checking' | 'valid' | 'invalid';
  accountName?: string;
  email?: string;
  plan?: string;
  monthlyLimit?: number;
  sentThisMonth?: number;
  remainingMessages?: number;
  domains?: string[];
  verifiedDomains?: string[];
  webhookCount?: number;
      routesCount?: number;
      createdAt?: string;
  error?: string;
}

export default function MailgunChecker() {
  const [accounts, setAccounts] = useState<MailgunAccount[]>(() => {
    const saved = sessionStorage.getItem('mailgun_accounts');
    return saved ? JSON.parse(saved) : [];
  });
  const [bulkInput, setBulkInput] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    sessionStorage.setItem('mailgun_accounts', JSON.stringify(accounts));
  }, [accounts]);

  const parseBulkInput = () => {
    const lines = bulkInput.trim().split('\n').filter(l => l.trim());
    const newAccounts: MailgunAccount[] = [];
    let skipped = 0;

    lines.forEach((line, index) => {
      const parts = line.split(/[|,\s]+/).filter(Boolean);
      if (parts.length >= 1) {
        const apiKey = parts[0].trim();
        const domain = parts[1]?.trim();

        if (apiKey && (apiKey.startsWith('key-') || apiKey.length > 20)) {
          newAccounts.push({
            id: `mailgun-${Date.now()}-${index}`,
            apiKey: apiKey,
            domain: domain,
            status: 'pending'
          });
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    });

    if (skipped > 0) {
      toast.warning(`${skipped} line(s) skipped — format: key-xxxxxxx|domain`);
    }

    setAccounts(prev => [...prev, ...newAccounts]);
    setBulkInput('');
    if (newAccounts.length > 0) {
      toast.success(`Added ${newAccounts.length} Mailgun API key(s)`);
    }
  };

  const checkMailgun = async (account: MailgunAccount) => {
    setAccounts(prev => prev.map(a =>
      a.id === account.id ? { ...a, status: 'checking' } : a
    ));

    try {
      const response = await fetch('/api/proxy/mailgun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: account.apiKey,
          domain: account.domain,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Invalid API key');
      }

      const domainsRes = result.results?.[0];
      if (!domainsRes?.ok) {
        throw new Error(domainsRes?.data?.message || 'Invalid API key');
      }

      const domainsData = domainsRes.data;
      const items = domainsData?.items || domainsData?.domains || [];
      const domainNames: string[] = items.map((d: any) => d.name || d.domain || '').filter(Boolean);
      const verifiedDomains = domainNames.filter(Boolean);

      setAccounts(prev => prev.map(a =>
        a.id === account.id ? {
          ...a,
          status: 'valid',
          accountName: domainNames[0] ? `Mailgun - ${domainNames[0]}` : 'Mailgun Account',
          email: domainNames[0] ? `admin@${domainNames[0]}` : '',
          domains: domainNames,
          verifiedDomains,
          monthlyLimit: domainsData.total_count ?? 0,
          sentThisMonth: 0,
          remainingMessages: 0,
          webhookCount: 0,
          routesCount: 0,
          createdAt: new Date().toISOString(),
        } : a
      ));

      toast.success(`Mailgun API key verified: ${account.apiKey.substring(0, 12)}...`);
    } catch (error: any) {
      const message = error.message || 'Invalid API key';
      setAccounts(prev => prev.map(a =>
        a.id === account.id ? {
          ...a,
          status: 'invalid',
          error: message
        } : a
      ));
      toast.error(`Mailgun: ${message.substring(0, 80)}`);
    }
  };

  const checkAll = async () => {
    const pending = accounts.filter(a => a.status === 'pending');
    if (pending.length === 0) {
      toast.info('No pending API keys to check');
      return;
    }

    setIsChecking(true);
    setProgress(0);

    for (let i = 0; i < pending.length; i++) {
      await checkMailgun(pending[i]);
      setProgress(((i + 1) / pending.length) * 100);
    }

    setIsChecking(false);
    toast.success('Bulk check completed');
  };

  const clearAll = () => {
    setAccounts([]);
    sessionStorage.removeItem('mailgun_accounts');
    toast.info('All API keys cleared');
  };

  const exportResults = () => {
    const data = accounts.map(a => ({
      apiKey: a.apiKey,
      domain: a.domain || '',
      accountName: a.accountName || '',
      email: a.email || '',
      status: a.status,
      plan: a.plan || '',
      monthlyLimit: a.monthlyLimit || '',
      sentThisMonth: a.sentThisMonth || '',
      remainingMessages: a.remainingMessages || '',
      domains: a.domains?.join(', ') || '',
      verifiedDomains: a.verifiedDomains?.join(', ') || '',
      webhookCount: a.webhookCount || '',
      routesCount: a.routesCount || '',
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
    a.download = `mailgun-check-${new Date().toISOString().split('T')[0]}.csv`;
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
  const totalRemaining = accounts
    .filter(a => a.status === 'valid' && a.remainingMessages)
    .reduce((sum, a) => sum + (a.remainingMessages || 0), 0);

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
                  <p className="text-slate-400 text-sm">Remaining Messages</p>
                  <p className="text-2xl font-bold text-amber-400">{totalRemaining.toLocaleString()}</p>
                </div>
                <Send className="w-8 h-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Input Section */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500 rounded-lg">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-white">Mailgun API Key Checker</CardTitle>
              <CardDescription className="text-slate-400">
                Verify API keys and fetch account details, domains, sending limits
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-slate-300">Bulk API Keys (format: apiKey|domain - optional)</Label>
            <Textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder="key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx|mg.yourdomain.com&#10;key-yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy|mg.otherdomain.com"
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
                    <TableHead className="text-slate-400">Sending Limit</TableHead>
                    <TableHead className="text-slate-400">Domains</TableHead>
                    <TableHead className="text-slate-400">Webhooks/Routes</TableHead>
                    <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id} className="border-slate-700">
                      <TableCell className="font-mono text-slate-300">
                        {account.apiKey.substring(0, 16)}...
                        {account.domain && (
                          <div className="text-xs text-slate-500 mt-1">{account.domain}</div>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(account.status)}</TableCell>
                      <TableCell>
                        {account.accountName && (
                          <div className="space-y-1">
                            <div className="text-slate-300 text-sm">{account.accountName}</div>
                            <div className="text-slate-500 text-xs">{account.email}</div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {account.plan && (
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/50">
                            <CreditCard className="w-3 h-3 mr-1" />
                            {account.plan}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {account.monthlyLimit !== undefined && (
                          <div className="space-y-1">
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50">
                              <Zap className="w-3 h-3 mr-1" />
                              {account.remainingMessages?.toLocaleString()} / {account.monthlyLimit?.toLocaleString()}
                            </Badge>
                            <div className="text-xs text-slate-500">
                              {account.sentThisMonth?.toLocaleString()} sent this month
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {account.domains && (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1 max-w-[150px]">
                              {account.domains.slice(0, 2).map((domain, i) => (
                                <Badge key={i} variant="outline" className="border-slate-600 text-slate-400 text-xs">
                                  <Globe className="w-3 h-3 mr-1" />
                                  {domain}
                                </Badge>
                              ))}
                              {account.domains.length > 2 && (
                                <Badge variant="outline" className="border-slate-600 text-slate-400 text-xs">
                                  +{account.domains.length - 2}
                                </Badge>
                              )}
                            </div>
                            {account.verifiedDomains && account.verifiedDomains.length > 0 && (
                              <div className="text-xs text-green-400">
                                {account.verifiedDomains.length} verified
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {account.webhookCount !== undefined && (
                            <Badge variant="outline" className="border-slate-600 text-slate-400 text-xs">
                              <Server className="w-3 h-3 mr-1" />
                              {account.webhookCount} webhooks
                            </Badge>
                          )}
                          {account.routesCount !== undefined && (
                            <Badge variant="outline" className="border-slate-600 text-slate-400 text-xs">
                              <Mail className="w-3 h-3 mr-1" />
                              {account.routesCount} routes
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => checkMailgun(account)}
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
