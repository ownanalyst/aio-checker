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
  Cloud,
  Play,
  Download,
  Trash2,
  CheckCircle,
  XCircle,
  User,
  Mail,
  BarChart3,
  Loader2,
  Copy,
  Key,
  AlertTriangle,
  Info,
  Shield,
  Square
} from 'lucide-react';
import { toast } from 'sonner';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { SESClient, GetSendQuotaCommand, ListIdentitiesCommand } from '@aws-sdk/client-ses';
import { IAMClient, ListUsersCommand } from '@aws-sdk/client-iam';

interface AWSCredential {
  id: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  status: 'pending' | 'checking' | 'valid' | 'invalid';
  iamUsers?: string[];
  canCreateIAM?: boolean;
  sesLimits?: {
    maxSendRate: number;
    max24HourSend: number;
    sentLast24Hours: number;
  } | null;
  sesDomains?: string[] | null;
  hasSESPolicy?: boolean;
  hasIAMPolicy?: boolean;
  accountId?: string;
  userArn?: string;
  error?: string;
  checkedAt?: string;
}

export default function AWSCredentialChecker() {
  const [credentials, setCredentials] = useState<AWSCredential[]>(() => {
    const saved = sessionStorage.getItem('aws_credentials');
    return saved ? JSON.parse(saved) : [];
  });
  const [bulkInput, setBulkInput] = useState('');
  const [defaultRegion, setDefaultRegion] = useState('us-east-1');
  const [isChecking, setIsChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    sessionStorage.setItem('aws_credentials', JSON.stringify(credentials));
  }, [credentials]);

  const regions = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-central-1',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
    'ca-central-1', 'sa-east-1'
  ];

  const parseBulkInput = () => {
    const lines = bulkInput.trim().split('\n').filter(l => l.trim());
    const newCredentials: AWSCredential[] = [];
    let skipped = 0;

    lines.forEach((line, index) => {
      const parts = line.split(/[|,\s]+/).filter(Boolean);
      if (parts.length >= 2) {
        newCredentials.push({
          id: `aws-${Date.now()}-${index}`,
          accessKeyId: parts[0].trim(),
          secretAccessKey: parts[1].trim(),
          region: parts[2]?.trim() || defaultRegion,
          status: 'pending'
        });
      } else {
        skipped++;
      }
    });

    if (skipped > 0) {
      toast.warning(`${skipped} line(s) skipped — format: accessKey|secretKey|region`);
    }

    setCredentials(prev => [...prev, ...newCredentials]);
    setBulkInput('');
    if (newCredentials.length > 0) {
      toast.success(`Added ${newCredentials.length} credential(s)`);
    }
  };

  /** Map AWS SDK error codes to human-readable messages */
  const mapAwsError = (err: any): string => {
    const code = err?.name || err?.Code || '';
    if (code === 'InvalidClientTokenId') return 'Invalid Access Key ID';
    if (code === 'SignatureDoesNotMatch') return 'Invalid Secret Access Key';
    if (code === 'ExpiredTokenException') return 'Security token has expired';
    if (code === 'AuthFailure') return 'Authentication failure';
    if (code === 'InvalidAccessKeyId') return 'Access key does not exist';
    if (code === 'TokenRefreshRequired') return 'Token refresh required';
    if (code === 'NetworkError' || err?.message?.includes('fetch')) {
      return 'Network error — check your connection';
    }
    return err?.message || 'Authentication failed';
  };

  const checkAWS = async (cred: AWSCredential, signal?: AbortSignal) => {
    setCredentials(prev =>
      prev.map(c => c.id === cred.id ? { ...c, status: 'checking' } : c)
    );

    // If region is explicitly set to 'auto' or empty, try regions sequentially
    const tryRegions = cred.region === 'auto' ? regions : [cred.region];

    for (const region of tryRegions) {
      if (signal?.aborted) return;

      const clientConfig = {
        region,
        credentials: {
          accessKeyId: cred.accessKeyId,
          secretAccessKey: cred.secretAccessKey,
        },
      };

      try {
        const stsClient = new STSClient(clientConfig);
        const identity = await stsClient.send(new GetCallerIdentityCommand({}), { abortSignal: signal });
        const accountId = identity.Account ?? 'Unknown';
        const userArn = identity.Arn ?? '';

        // Step 2: Try SES access (parallel)
        let hasSESPolicy = false;
        let sesLimits: AWSCredential['sesLimits'] = null;
        let sesDomains: string[] | null = null;

        // Step 3: Try IAM access (parallel)
        let hasIAMPolicy = false;
        let iamUsers: string[] = [];

        const [sesResult, iamResult] = await Promise.allSettled([
          (async () => {
            const sesClient = new SESClient(clientConfig);
            const [quota, identities] = await Promise.all([
              sesClient.send(new GetSendQuotaCommand({}), { abortSignal: signal }),
              sesClient.send(new ListIdentitiesCommand({ IdentityType: 'Domain', MaxItems: 10 }), { abortSignal: signal }),
            ]);
            return { quota, identities };
          })(),
          (async () => {
            const iamClient = new IAMClient(clientConfig);
            const users = await iamClient.send(new ListUsersCommand({ MaxItems: 10 }), { abortSignal: signal });
            return users;
          })(),
        ]);

        if (sesResult.status === 'fulfilled') {
          hasSESPolicy = true;
          const { quota, identities } = sesResult.value;
          sesLimits = {
            maxSendRate: quota.MaxSendRate ?? 0,
            max24HourSend: quota.Max24HourSend ?? 0,
            sentLast24Hours: quota.SentLast24Hours ?? 0,
          };
          sesDomains = identities.Identities ?? [];
        }

        if (iamResult.status === 'fulfilled') {
          hasIAMPolicy = true;
          iamUsers = (iamResult.value.Users ?? [])
            .map(u => u.UserName ?? '')
            .filter(Boolean);
        }

        setCredentials(prev =>
          prev.map(c =>
            c.id === cred.id
              ? {
                  ...c,
                  status: 'valid',
                  region,
                  accountId,
                  userArn,
                  hasSESPolicy,
                  hasIAMPolicy,
                  sesLimits,
                  sesDomains,
                  iamUsers,
                  canCreateIAM: hasIAMPolicy,
                  checkedAt: new Date().toISOString(),
                }
              : c
          )
        );

        const regionNote = cred.region === 'auto' ? ` (${region})` : '';
        toast.success(`AWS verified — Account: ${accountId}${regionNote}`);
        return; // Success, stop trying regions
      } catch (err: any) {
        // If aborted, don't try next region
        if (signal?.aborted) return;

        // If this was the only region, mark as invalid
        if (tryRegions.length === 1) {
          const message = mapAwsError(err);
          setCredentials(prev =>
            prev.map(c =>
              c.id === cred.id ? { ...c, status: 'invalid', error: message } : c
            )
          );
          toast.error(`AWS: ${message}`);
        }
        // If auto-region and this region failed, try the next one silently
      }
    }

    // If all regions failed in auto mode
    if (cred.region === 'auto') {
      setCredentials(prev =>
        prev.map(c =>
          c.id === cred.id ? { ...c, status: 'invalid', error: 'Invalid credentials (all regions tried)' } : c
        )
      );
      toast.error('AWS: Invalid credentials (all regions tried)');
    }
  };

  const checkAll = async () => {
    const pending = credentials.filter(c => c.status === 'pending');
    if (pending.length === 0) {
      toast.info('No pending credentials to check');
      return;
    }

    abortRef.current = new AbortController();
    setIsChecking(true);
    setProgress(0);

    for (let i = 0; i < pending.length; i++) {
      if (abortRef.current.signal.aborted) break;
      await checkAWS(pending[i], abortRef.current.signal);
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
    setCredentials([]);
    sessionStorage.removeItem('aws_credentials');
    toast.info('All credentials cleared');
  };

  const exportResults = () => {
    if (credentials.length === 0) {
      toast.info('No data to export');
      return;
    }

    const data = credentials.map(c => ({
      accessKeyId: c.accessKeyId,
      region: c.region,
      status: c.status,
      accountId: c.accountId || '',
      userArn: c.userArn || '',
      hasIAMPolicy: c.hasIAMPolicy ? 'Yes' : 'No',
      hasSESPolicy: c.hasSESPolicy ? 'Yes' : 'No',
      iamUsers: c.iamUsers?.join('; ') || '',
      sesMaxSendRate: c.sesLimits?.maxSendRate ?? 'N/A',
      sesMax24Hour: c.sesLimits?.max24HourSend ?? 'N/A',
      sesSent24Hour: c.sesLimits?.sentLast24Hours ?? 'N/A',
      sesDomains: c.sesDomains?.join('; ') || '',
      error: c.error || '',
      checkedAt: c.checkedAt || '',
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
    a.download = `aws-credentials-check-${new Date().toISOString().split('T')[0]}.csv`;
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

  return (
    <div className="space-y-6">
      {/* Input Section */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500 rounded-lg">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-white">AWS Credential Checker</CardTitle>
              <CardDescription className="text-slate-400">
                Validates credentials via STS · Checks IAM users · Checks SES limits &amp; domains
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-slate-300">Default Region</Label>
              <select
                value={defaultRegion}
                onChange={(e) => setDefaultRegion(e.target.value)}
                className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-md px-3 py-2 text-white"
              >
                <option value="auto">Auto-detect region</option>
                {regions.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div>
            <Label className="text-slate-300">Bulk Credentials (format: accessKey|secretKey|region)</Label>
            <Textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder={`AKIAIOSFODNN7EXAMPLE|wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY|us-east-1\nAKIAI44QH8DHBEXAMPLE|je7MtGbClwBF/2Zp9Utk/h3yCo8nvbEXAMPLEKEY|eu-west-1`}
              className="mt-1 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 min-h-[120px]"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={parseBulkInput} className="bg-indigo-600 hover:bg-indigo-700">
              <Key className="w-4 h-4 mr-2" />
              Add Credentials
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
      {credentials.length > 0 && (
        <Card className="bg-slate-800/60 border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Results ({credentials.length} credentials)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400">Access Key ID</TableHead>
                    <TableHead className="text-slate-400">Region</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Account ID</TableHead>
                    <TableHead className="text-slate-400">IAM Policy</TableHead>
                    <TableHead className="text-slate-400">SES Policy</TableHead>
                    <TableHead className="text-slate-400">IAM Users</TableHead>
                    <TableHead className="text-slate-400">SES Limits</TableHead>
                    <TableHead className="text-slate-400">SES Domains</TableHead>
                    <TableHead className="text-slate-400">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {credentials.map((cred) => (
                    <TableRow key={cred.id} className="border-slate-700">
                      <TableCell className="font-mono text-slate-300">
                        {cred.accessKeyId.substring(0, 12)}...
                      </TableCell>
                      <TableCell className="text-slate-300">{cred.region}</TableCell>
                      <TableCell>
                        {getStatusBadge(cred.status)}
                        {cred.error && (
                          <p className="text-xs text-red-400 mt-1 max-w-[160px] break-words">{cred.error}</p>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-slate-400 text-xs">
                        {cred.accountId || '-'}
                      </TableCell>
                      <TableCell>
                        {cred.hasIAMPolicy !== undefined && (
                          <Badge className={cred.hasIAMPolicy
                            ? 'bg-green-500/20 text-green-400 border-green-500/50'
                            : 'bg-red-500/20 text-red-400 border-red-500/50'
                          }>
                            {cred.hasIAMPolicy ? <Shield className="w-3 h-3 mr-1" /> : <AlertTriangle className="w-3 h-3 mr-1" />}
                            {cred.hasIAMPolicy ? 'Yes' : 'No'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {cred.hasSESPolicy !== undefined && (
                          <Badge className={cred.hasSESPolicy
                            ? 'bg-green-500/20 text-green-400 border-green-500/50'
                            : 'bg-orange-500/20 text-orange-400 border-orange-500/50'
                          }>
                            {cred.hasSESPolicy ? <Mail className="w-3 h-3 mr-1" /> : <Info className="w-3 h-3 mr-1" />}
                            {cred.hasSESPolicy ? 'Yes' : 'No'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {cred.iamUsers && cred.iamUsers.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {cred.iamUsers.map((user, i) => (
                              <Badge key={i} variant="outline" className="border-slate-600 text-slate-400 text-xs">
                                <User className="w-3 h-3 mr-1" />
                                {user}
                              </Badge>
                            ))}
                          </div>
                        ) : cred.hasIAMPolicy === false ? (
                          <span className="text-xs text-slate-500">No IAM access</span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {cred.sesLimits ? (
                          <div className="text-xs text-slate-400 space-y-1">
                            <div>Rate: {cred.sesLimits.maxSendRate}/sec</div>
                            <div>24h: {cred.sesLimits.sentLast24Hours}/{cred.sesLimits.max24HourSend}</div>
                          </div>
                        ) : cred.hasSESPolicy === false ? (
                          <span className="text-xs text-slate-500">No SES access</span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {cred.sesDomains && cred.sesDomains.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {cred.sesDomains.map((domain, i) => (
                              <Badge key={i} variant="outline" className="border-slate-600 text-slate-400 text-xs">
                                <Mail className="w-3 h-3 mr-1" />
                                {domain}
                              </Badge>
                            ))}
                          </div>
                        ) : cred.hasSESPolicy === false ? (
                          <span className="text-xs text-slate-500">No SES access</span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => checkAWS(cred)}
                            disabled={cred.status === 'checking'}
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(`${cred.accessKeyId}|${cred.secretAccessKey}`);
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
