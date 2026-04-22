import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Send,
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
  Shield,
  Zap,
  AlertTriangle,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import { useCheckerStatus } from "@/context/CheckerContext";

interface SendGridAccount {
  id: string;
  apiKey: string;
  status: "pending" | "checking" | "valid" | "invalid";
  accountName?: string;
  email?: string;
  username?: string;
  accountType?: string;
  plan?: string;
  creditsRemaining?: number;
  creditsTotal?: number;
  sendsThisMonth?: number;
  verified?: boolean;
  twoFactorEnabled?: boolean;
  createdAt?: string;
  error?: string;
  scopes?: string[];
}

export default function SendGridChecker() {
  const { setCheckerStatus } = useCheckerStatus();
  const [accounts, setAccounts] = useState<SendGridAccount[]>(() => {
    const saved = sessionStorage.getItem("sendgrid_accounts");
    return saved ? JSON.parse(saved) : [];
  });
  const [bulkInput, setBulkInput] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    sessionStorage.setItem("sendgrid_accounts", JSON.stringify(accounts));
  }, [accounts]);

  const parseBulkInput = () => {
    const lines = bulkInput
      .trim()
      .split("\n")
      .filter((l) => l.trim());
    const newAccounts: SendGridAccount[] = [];
    let skipped = 0;

    lines.forEach((line, index) => {
      // Split by pipe first, trim whitespace
      const rawParts = line
        .split("|")
        .map((p) => p.trim())
        .filter(Boolean);

      // Strip IP/path prefix (e.g., "176.31.82.212/.env" or "path/to/.env.example")
      let parts = rawParts;
      if (rawParts.length > 0 && rawParts[0].includes("/")) {
        parts = rawParts.slice(1);
      }

      // Find the SendGrid API key (starts with SG.)
      let apiKey = "";
      for (const part of parts) {
        // Handle KEY=VALUE format (e.g., SENDGRID_API_KEY=SG.xxx)
        const cleanValue = part.includes("=")
          ? part.split("=").slice(-1)[0].trim()
          : part.trim();
        if (cleanValue.startsWith("SG.")) {
          apiKey = cleanValue;
          break;
        }
      }

      if (apiKey) {
        newAccounts.push({
          id: `sendgrid-${Date.now()}-${index}`,
          apiKey,
          status: "pending",
        });
      } else {
        skipped++;
      }
    });

    if (skipped > 0) {
      toast.warning(`${skipped} line(s) skipped — format: SG.xxxxxxxx`);
    }

    // Cap at 500 per batch
    const capped = newAccounts.slice(0, 500);
    if (newAccounts.length > 500) {
      toast.warning(
        `Capped at 500 API keys. ${newAccounts.length - 500} were not added.`,
      );
    }

    setAccounts((prev) => [...prev, ...capped]);
    setBulkInput("");
    if (capped.length > 0) {
      toast.success(`Added ${capped.length} SendGrid API key(s)`);
    }
  };

  const checkSendGrid = async (account: SendGridAccount) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === account.id ? { ...a, status: "checking" } : a)),
    );

    try {
      const response = await fetch("/api/proxy/sendgrid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: account.apiKey }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Invalid API key");
      }

      const accountRes = result.results?.[0]; // /user/account → { type, reputation }
      const creditsRes = result.results?.[1]; // /user/credits → { remain, total, used }
      const profileRes = result.results?.[2]; // /user/profile → { username, email, first_name, last_name, company }
      const scopesRes = result.results?.[3]; // /scopes → { scopes: string[] }

      if (!accountRes?.ok) {
        const errMsg =
          accountRes?.data?.errors?.[0]?.message || "Invalid API key";
        throw new Error(errMsg);
      }

      const accountData = accountRes.data as {
        type?: string;
        reputation?: number;
      };
      const creditsData = creditsRes?.ok
        ? (creditsRes.data as {
            remain?: number;
            total?: number;
            used?: number;
          })
        : null;
      const profileData = profileRes?.ok
        ? (profileRes.data as {
            username?: string;
            email?: string;
            first_name?: string;
            last_name?: string;
            company?: string;
          })
        : null;
      const scopesData = scopesRes?.ok
        ? (scopesRes.data as { scopes?: string[] })
        : null;

      const accountName =
        profileData?.company ||
        (profileData?.first_name
          ? `${profileData.first_name} ${profileData.last_name || ""}`.trim()
          : "") ||
        profileData?.username ||
        "SendGrid Account";

      setAccounts((prev) =>
        prev.map((a) =>
          a.id === account.id
            ? {
                ...a,
                status: "valid",
                accountName,
                email: profileData?.email || "",
                username: profileData?.username || "",
                accountType: accountData?.type || "",
                plan: accountData?.type
                  ? accountData.type.charAt(0).toUpperCase() +
                    accountData.type.slice(1)
                  : "Unknown",
                creditsRemaining: creditsData?.remain ?? 0,
                creditsTotal: creditsData?.total ?? 0,
                sendsThisMonth: creditsData?.used ?? 0,
                verified: profileRes?.ok ?? false,
                twoFactorEnabled: false,
                createdAt: "",
                scopes: scopesData?.scopes ?? [],
              }
            : a,
        ),
      );

      toast.success(`SendGrid verified: ${accountName}`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Invalid API key";
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === account.id
            ? {
                ...a,
                status: "invalid",
                error: message,
              }
            : a,
        ),
      );
      toast.error(`SendGrid: ${message.substring(0, 80)}`);
    }
  };

  const checkAll = async () => {
    const pending = accounts.filter((a) => a.status === "pending");
    if (pending.length === 0) {
      toast.info("No pending API keys to check");
      return;
    }

    if (pending.length > 500) {
      toast.error(
        `Maximum 500 API keys per batch. You have ${pending.length}. Please split into smaller batches.`,
      );
      return;
    }

    abortRef.current = new AbortController();
    setIsChecking(true);
    setProgress(0);
    setCheckerStatus("SendGrid", true, 0);

    for (let i = 0; i < pending.length; i++) {
      if (abortRef.current.signal.aborted) break;
      await checkSendGrid(pending[i]);
      const p = ((i + 1) / pending.length) * 100;
      setProgress(p);
      setCheckerStatus("SendGrid", true, p);
    }

    setIsChecking(false);
    setCheckerStatus("SendGrid", false, 100);
    abortRef.current = null;
    toast.success("Bulk check completed");
  };

  const stopCheck = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      setIsChecking(false);
      toast.info("Check stopped");
    }
  };

  const clearAll = () => {
    stopCheck();
    setAccounts([]);
    sessionStorage.removeItem("sendgrid_accounts");
    toast.info("All API keys cleared");
  };

  const exportResults = () => {
    const data = accounts.map((a) => ({
      apiKey: a.apiKey,
      accountName: a.accountName || "",
      email: a.email || "",
      username: a.username || "",
      status: a.status,
      plan: a.plan || "",
      creditsRemaining: a.creditsRemaining || "",
      creditsTotal: a.creditsTotal || "",
      sendsThisMonth: a.sendsThisMonth || "",
      verified: a.verified ? "Yes" : "No",
      twoFactorEnabled: a.twoFactorEnabled ? "Yes" : "No",
      scopes: a.scopes?.join(", ") || "",
      createdAt: a.createdAt || "",
      error: a.error || "",
    }));

    const csv = [
      Object.keys(data[0]).join(","),
      ...data.map((row) =>
        Object.values(row)
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sendgrid-check-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Results exported");
  };

  const exportTxt = () => {
    if (accounts.length === 0) {
      toast.info("No data to export");
      return;
    }

    const lines = accounts
      .filter((a) => a.status === "valid" || a.status === "invalid")
      .map((a) => a.apiKey);

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sendgrid-results-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${lines.length} result(s) exported as TXT`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "valid":
        return (
          <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
            <CheckCircle className="w-3 h-3 mr-1" /> Valid
          </Badge>
        );
      case "invalid":
        return (
          <Badge className="bg-red-500/20 text-red-400 border-red-500/50">
            <XCircle className="w-3 h-3 mr-1" /> Invalid
          </Badge>
        );
      case "checking":
        return (
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Checking
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="border-slate-600 text-slate-400">
            Pending
          </Badge>
        );
    }
  };

  const validCount = accounts.filter((a) => a.status === "valid").length;
  const invalidCount = accounts.filter((a) => a.status === "invalid").length;
  const totalCredits = accounts
    .filter((a) => a.status === "valid" && a.creditsRemaining)
    .reduce((sum, a) => sum + (a.creditsRemaining || 0), 0);

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
                  <p className="text-2xl font-bold text-white">
                    {accounts.length}
                  </p>
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
                  <p className="text-2xl font-bold text-green-400">
                    {validCount}
                  </p>
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
                  <p className="text-2xl font-bold text-red-400">
                    {invalidCount}
                  </p>
                </div>
                <TrendingDown className="w-8 h-8 text-red-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/60 border-slate-700/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Total Credits</p>
                  <p className="text-2xl font-bold text-cyan-400">
                    {totalCredits.toLocaleString()}
                  </p>
                </div>
                <Zap className="w-8 h-8 text-cyan-400" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Input Section */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500 rounded-lg">
              <Send className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-white">
                SendGrid API Key Checker
              </CardTitle>
              <CardDescription className="text-slate-400">
                Verify API keys and fetch account details, credits, and usage
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-slate-300">
              Bulk API Keys (one per line, starting with SG.)
            </Label>
            <Textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder="SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx&#10;SG.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
              className="mt-1 bg-slate-900 border-slate-700 text-white placeholder:text-slate-600 min-h-[120px]"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={parseBulkInput}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              <Key className="w-4 h-4 mr-2" />
              Add API Keys
            </Button>
            <Button
              onClick={checkAll}
              disabled={isChecking}
              className="bg-green-600 hover:bg-green-700"
            >
              {isChecking ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Check All
            </Button>
            {isChecking && (
              <Button
                onClick={stopCheck}
                className="bg-red-600 hover:bg-red-700"
              >
                <Square className="w-4 h-4 mr-2" />
                Stop
              </Button>
            )}
            <Button onClick={clearAll} variant="destructive">
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All
            </Button>
            <Button
              onClick={exportResults}
              variant="outline"
              className="border-slate-600"
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button
              onClick={exportTxt}
              variant="outline"
              className="border-slate-600"
            >
              <Download className="w-4 h-4 mr-2" />
              Export TXT
            </Button>
          </div>

          {isChecking && (
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-slate-400 text-center">
                {Math.round(progress)}% complete
              </p>
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
                    <TableHead className="text-slate-400">Security</TableHead>
                    <TableHead className="text-slate-400">Scopes</TableHead>
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
                            <div className="text-slate-300 text-sm">
                              {account.accountName}
                            </div>
                            <div className="text-slate-500 text-xs">
                              {account.email}
                            </div>
                            <div className="text-slate-600 text-xs font-mono">
                              @{account.username}
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {account.plan && (
                          <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/50">
                            <Zap className="w-3 h-3 mr-1" />
                            {account.plan}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {account.creditsRemaining !== undefined && (
                          <div className="space-y-1">
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50">
                              {account.creditsRemaining.toLocaleString()} /{" "}
                              {account.creditsTotal?.toLocaleString()}
                            </Badge>
                            <div className="text-xs text-slate-500">
                              {account.sendsThisMonth?.toLocaleString()} sends
                              this month
                            </div>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {account.verified ? (
                            <Badge
                              variant="outline"
                              className="border-green-600 text-green-400 text-xs"
                            >
                              <Shield className="w-3 h-3 mr-1" />
                              Verified
                            </Badge>
                          ) : account.verified === false ? (
                            <Badge
                              variant="outline"
                              className="border-orange-600 text-orange-400 text-xs"
                            >
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Unverified
                            </Badge>
                          ) : null}
                          {account.twoFactorEnabled && (
                            <Badge
                              variant="outline"
                              className="border-blue-600 text-blue-400 text-xs"
                            >
                              <Key className="w-3 h-3 mr-1" />
                              2FA
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {account.scopes && (
                          <div className="flex flex-wrap gap-1 max-w-[150px]">
                            {account.scopes.slice(0, 3).map((scope, i) => (
                              <Badge
                                key={i}
                                variant="outline"
                                className="border-slate-600 text-slate-400 text-xs"
                              >
                                {scope}
                              </Badge>
                            ))}
                            {account.scopes.length > 3 && (
                              <Badge
                                variant="outline"
                                className="border-slate-600 text-slate-400 text-xs"
                              >
                                +{account.scopes.length - 3} more
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => checkSendGrid(account)}
                            disabled={account.status === "checking"}
                          >
                            <Play className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(account.apiKey);
                              toast.success("Copied to clipboard");
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
