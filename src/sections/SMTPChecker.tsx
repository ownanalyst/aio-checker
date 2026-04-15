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
  Shield,
  Lock,
  Unlock,
  BarChart3,
  Copy,
  Server,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
  Square
} from 'lucide-react';
import { toast } from 'sonner';
import { useCheckerStatus } from '@/context/CheckerContext';

interface SMTPServer {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  status: 'pending' | 'checking' | 'valid' | 'invalid';
  tlsVersion?: string;
  sslEnabled?: boolean;
  authMethod?: string;
  connectionTime?: number;
  serverInfo?: string;
  error?: string;
}

export default function SMTPChecker() {
  const { setCheckerStatus } = useCheckerStatus();
  const [servers, setServers] = useState<SMTPServer[]>(() => {
    const saved = sessionStorage.getItem('smtp_servers');
    return saved ? JSON.parse(saved) : [];
  });
  const [bulkInput, setBulkInput] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [defaultPort, setDefaultPort] = useState('587');
  const [testRecipient, setTestRecipient] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    sessionStorage.setItem('smtp_servers', JSON.stringify(servers));
  }, [servers]);

  const parseBulkInput = () => {
    const lines = bulkInput.trim().split('\n').filter(l => l.trim());
    const newServers: SMTPServer[] = [];
    let skipped = 0;

    lines.forEach((line, index) => {
      // Split by pipe, trim whitespace
      const rawParts = line.split('|').map(p => p.trim()).filter(Boolean);

      // Detect and strip IP/path prefix (e.g., "176.31.82.212/.env" or "78.141.208.51/.env.example")
      let parts = rawParts;
      if (rawParts.length > 0 && rawParts[0].includes('/')) {
        parts = rawParts.slice(1);
      }

      if (parts.length >= 4) {
        newServers.push({
          id: `smtp-${Date.now()}-${index}`,
          host: parts[0].trim(),
          port: parseInt(parts[1]) || parseInt(defaultPort),
          username: parts[2].trim(),
          password: parts.slice(3).join('|').trim(),
          status: 'pending'
        });
      } else {
        skipped++;
      }
    });

    if (skipped > 0) {
      toast.warning(`${skipped} line(s) skipped — format: host|port|username|password`);
    }

    // Cap at 500 per batch
    const capped = newServers.slice(0, 500);
    if (newServers.length > 500) {
      toast.warning(`Capped at 500 servers. ${newServers.length - 500} were not added.`);
    }

    setServers(prev => [...prev, ...capped]);
    setBulkInput('');
    if (capped.length > 0) {
      toast.success(`Added ${capped.length} SMTP server(s)`);
    }
  };

  const checkSMTP = async (server: SMTPServer) => {
    setServers(prev => prev.map(s =>
      s.id === server.id ? { ...s, status: 'checking' } : s
    ));

    try {
      const response = await fetch('/api/smtp/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: server.host,
          port: server.port,
          username: server.username,
          password: server.password,
          testRecipient: testRecipient || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'SMTP validation failed');
      }

      setServers(prev => prev.map(s =>
        s.id === server.id ? {
          ...s,
          status: 'valid',
          tlsVersion: data.tlsVersion,
          sslEnabled: data.sslEnabled,
          authMethod: data.authMethod,
          connectionTime: data.connectionTime,
          serverInfo: data.serverInfo,
        } : s
      ));

      const mailMsg = data.mailSent ? ` (test email sent to ${testRecipient})` : '';
      toast.success(`SMTP server valid: ${server.host}${mailMsg}`);
    } catch (error: any) {
      const message = error.message || 'Connection error';
      setServers(prev => prev.map(s =>
        s.id === server.id ? {
          ...s,
          status: 'invalid',
          error: message
        } : s
      ));
      toast.error(`SMTP: ${message.substring(0, 80)}`);
    }
  };

  const checkAll = async () => {
    const pending = servers.filter(s => s.status === 'pending');
    if (pending.length === 0) {
      toast.info('No pending servers to check');
      return;
    }

    if (pending.length > 500) {
      toast.error(`Maximum 500 servers per batch. You have ${pending.length}. Please split into smaller batches.`);
      return;
    }

    abortRef.current = new AbortController();
    setIsChecking(true);
    setProgress(0);
    setCheckerStatus('SMTP', true, 0);

    for (let i = 0; i < pending.length; i++) {
      if (abortRef.current.signal.aborted) break;
      await checkSMTP(pending[i]);
      const p = ((i + 1) / pending.length) * 100;
      setProgress(p);
      setCheckerStatus('SMTP', true, p);
    }

    setIsChecking(false);
    setCheckerStatus('SMTP', false, 100);
    abortRef.current = null;
    toast.success('Bulk SMTP check completed');
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
    setServers([]);
    sessionStorage.removeItem('smtp_servers');
    toast.info('All servers cleared');
  };

  const exportResults = () => {
    const data = servers.map(s => ({
      host: s.host,
      port: s.port,
      username: s.username,
      status: s.status,
      tlsVersion: s.tlsVersion || '',
      sslEnabled: s.sslEnabled ? 'Yes' : 'No',
      authMethod: s.authMethod || '',
      connectionTime: s.connectionTime ? `${s.connectionTime.toFixed(0)}ms` : '',
      serverInfo: s.serverInfo || '',
      error: s.error || ''
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
    a.download = `smtp-validation-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Results exported');
  };

  const exportTxt = () => {
    if (servers.length === 0) {
      toast.info('No data to export');
      return;
    }

    const lines = servers
      .filter(s => s.status === 'valid' || s.status === 'invalid')
      .map(s => `${s.host}|${s.port}|${s.username}|${s.password}`);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smtp-results-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${lines.length} result(s) exported as TXT`);
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

  const getTLSBadge = (tlsVersion?: string) => {
    if (!tlsVersion) return '-';
    
    const isSecure = tlsVersion.includes('TLS 1.3') || tlsVersion.includes('TLS 1.2');
    
    return (
      <Badge className={isSecure 
        ? 'bg-green-500/20 text-green-400 border-green-500/50' 
        : 'bg-orange-500/20 text-orange-400 border-orange-500/50'
      }>
        {isSecure ? <ShieldCheck className="w-3 h-3 mr-1" /> : <ShieldAlert className="w-3 h-3 mr-1" />}
        {tlsVersion}
      </Badge>
    );
  };

  const validCount = servers.filter(s => s.status === 'valid').length;
  const invalidCount = servers.filter(s => s.status === 'invalid').length;
  const secureCount = servers.filter(s => s.status === 'valid' && s.tlsVersion?.includes('TLS 1.3')).length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {servers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-800/60 border-slate-700/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Total Servers</p>
                  <p className="text-2xl font-bold text-white">{servers.length}</p>
                </div>
                <Server className="w-8 h-8 text-indigo-400" />
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
                  <p className="text-slate-400 text-sm">TLS 1.3 Secure</p>
                  <p className="text-2xl font-bold text-emerald-400">{secureCount}</p>
                </div>
                <Shield className="w-8 h-8 text-emerald-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Input Section */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500 rounded-lg">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-white">SMTP Validator</CardTitle>
              <CardDescription className="text-slate-400">
                Validate SMTP servers with automatic TLS/SSL detection
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-300">Default Port</Label>
              <select
                value={defaultPort}
                onChange={(e) => setDefaultPort(e.target.value)}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-white"
              >
                <option value="587">587 (STARTTLS)</option>
                <option value="465">465 (SSL/TLS)</option>
                <option value="25">25 (Plain)</option>
                <option value="2525">2525 (Alternative)</option>
              </select>
            </div>
            <div>
              <Label className="text-slate-300">Test Recipient Email (optional)</Label>
              <input
                type="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="recipient@example.com"
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-white placeholder:text-slate-600"
              />
            </div>
          </div>

          <div>
            <Label className="text-slate-300">Bulk SMTP Servers (format: host|port|username|password)</Label>
            <Textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder={`176.31.82.212/.env | authsmtp.securemail.pro|587|noreply@legallogger.net|KJVP4.V.8bAc@uN\nsmtp.gmail.com|587|kitchenaradev@gmail.com|zpsltfqrrtevcbpd\n78.141.208.51/.env.example | smtp.mailgun.org|587|postmaster@mg.privr.net|f8a3b21e-9c47-4d6a-b5e1-EXAMPLE`}
              className="mt-1 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 min-h-[120px]"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={parseBulkInput} className="bg-indigo-600 hover:bg-indigo-700">
              <Server className="w-4 h-4 mr-2" />
              Add Servers
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
            <Button onClick={exportTxt} variant="outline" className="border-slate-600">
              <Download className="w-4 h-4 mr-2" />
              Export TXT
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
      {servers.length > 0 && (
        <Card className="bg-slate-800/60 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Results ({servers.length} servers)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">Host</TableHead>
                    <TableHead className="text-slate-400">Port</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">TLS/SSL</TableHead>
                    <TableHead className="text-slate-400">Auth Method</TableHead>
                    <TableHead className="text-slate-400">Connection</TableHead>
                    <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {servers.map((server) => (
                    <TableRow key={server.id} className="border-slate-700">
                      <TableCell className="font-mono text-slate-300">{server.host}</TableCell>
                      <TableCell className="text-slate-300">{server.port}</TableCell>
                      <TableCell>{getStatusBadge(server.status)}</TableCell>
                      <TableCell>{getTLSBadge(server.tlsVersion)}</TableCell>
                      <TableCell>
                        {server.authMethod && (
                          <Badge variant="outline" className="border-slate-600 text-slate-400">
                            {server.sslEnabled ? <Lock className="w-3 h-3 mr-1" /> : <Unlock className="w-3 h-3 mr-1" />}
                            {server.authMethod}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {server.connectionTime && (
                          <span className="text-xs text-slate-400">
                            {server.connectionTime.toFixed(0)}ms
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => checkSMTP(server)}
                            disabled={server.status === 'checking'}
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(`${server.host}|${server.port}|${server.username}|${server.password}`);
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
