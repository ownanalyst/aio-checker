import { useState, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Cloud,
  MessageSquare,
  Phone,
  Mail,
  Send,
  Shield,
  CheckCircle,
  Server,
  Key,
  Lock,
  Globe,
  Zap,
  Mail as MailIcon,
  Loader2,
  X,
  Users
} from 'lucide-react';
import AWSCredentialChecker from './sections/AWSCredentialChecker';
import TwilioChecker from './sections/TwilioChecker';
import NexmoChecker from './sections/NexmoChecker';
import SMTPChecker from './sections/SMTPChecker';
import SendGridChecker from './sections/SendGridChecker';
import BrevoChecker from './sections/BrevoChecker';
import MailgunChecker from './sections/MailgunChecker';
import { CheckerProvider, useCheckerStatus } from './context/CheckerContext';

function GlobalCheckerIndicator() {
  const { activeCheckers } = useCheckerStatus();

  if (activeCheckers.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {activeCheckers.map(checker => (
        <div key={checker.name} className="bg-slate-800/95 backdrop-blur-md border border-indigo-500/50 rounded-lg p-3 shadow-xl shadow-indigo-500/10">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
            <span className="text-sm font-medium text-white">{checker.name}</span>
            <span className="text-xs text-slate-400 ml-auto">{Math.round(checker.progress)}%</span>
          </div>
          <Progress value={checker.progress} className="h-1.5" />
        </div>
      ))}
    </div>
  );
}

function useHeartbeat() {
  const [online, setOnline] = useState(1);
  const userIdRef = useRef<string>(`user-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const sendHeartbeat = async () => {
      try {
        const res = await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: userIdRef.current }),
        });
        const data = await res.json();
        setOnline(data.online);
      } catch {
        // Backend not running, show 1 (self only)
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 15000);
    return () => clearInterval(interval);
  }, []);

  return online;
}

function AppContent() {
  const [activeTab, setActiveTab] = useState('aws');
  const onlineCount = useHeartbeat();

  const services = [
    {
      id: 'aws',
      name: 'AWS',
      icon: Cloud,
      description: 'Check IAM, SES limits & domains',
      color: 'bg-orange-500',
      status: 'active'
    },
    {
      id: 'twilio',
      name: 'Twilio',
      icon: MessageSquare,
      description: 'Check account balance & status',
      color: 'bg-red-500',
      status: 'active'
    },
    {
      id: 'nexmo',
      name: 'Nexmo/Vonage',
      icon: Phone,
      description: 'Check balance & account info',
      color: 'bg-blue-500',
      status: 'active'
    },
    {
      id: 'smtp',
      name: 'SMTP Validator',
      icon: Mail,
      description: 'Validate SMTP with TLS/SSL',
      color: 'bg-green-500',
      status: 'active'
    },
    {
      id: 'sendgrid',
      name: 'SendGrid',
      icon: Send,
      description: 'Check API key & account',
      color: 'bg-cyan-500',
      status: 'active'
    },
    {
      id: 'brevo',
      name: 'Brevo',
      icon: Zap,
      description: 'Check credits & contacts',
      color: 'bg-violet-500',
      status: 'active'
    },
    {
      id: 'mailgun',
      name: 'Mailgun',
      icon: MailIcon,
      description: 'Check domains & limits',
      color: 'bg-amber-500',
      status: 'active'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">API Credential Checker</h1>
                <p className="text-xs text-slate-400">Bulk validation dashboard for multiple services</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-green-500/50 text-green-400 bg-green-500/10">
                <CheckCircle className="w-3 h-3 mr-1" />
                Session Based
              </Badge>
              <Badge variant="outline" className="border-cyan-500/50 text-cyan-400 bg-cyan-500/10">
                <Users className="w-3 h-3 mr-1" />
                {onlineCount} online
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Service Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
          {services.map((service) => (
            <Card 
              key={service.id}
              className={`cursor-pointer transition-all duration-300 hover:scale-105 ${
                activeTab === service.id 
                  ? 'ring-2 ring-indigo-500 bg-slate-800/80' 
                  : 'bg-slate-800/40 hover:bg-slate-800/60'
              }`}
              onClick={() => setActiveTab(service.id)}
            >
              <CardContent className="p-3">
                <div className="flex flex-col items-center text-center gap-2">
                  <div className={`p-2 rounded-lg ${service.color}`}>
                    <service.icon className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-xs">{service.name}</h3>
                    <p className="text-[10px] text-slate-400 leading-tight">{service.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="hidden">
            <TabsTrigger value="aws">AWS</TabsTrigger>
            <TabsTrigger value="twilio">Twilio</TabsTrigger>
            <TabsTrigger value="nexmo">Nexmo</TabsTrigger>
            <TabsTrigger value="smtp">SMTP</TabsTrigger>
            <TabsTrigger value="sendgrid">SendGrid</TabsTrigger>
            <TabsTrigger value="brevo">Brevo</TabsTrigger>
            <TabsTrigger value="mailgun">Mailgun</TabsTrigger>
          </TabsList>

          <TabsContent value="aws" className="mt-0">
            <AWSCredentialChecker />
          </TabsContent>

          <TabsContent value="twilio" className="mt-0">
            <TwilioChecker />
          </TabsContent>

          <TabsContent value="nexmo" className="mt-0">
            <NexmoChecker />
          </TabsContent>

          <TabsContent value="smtp" className="mt-0">
            <SMTPChecker />
          </TabsContent>

          <TabsContent value="sendgrid" className="mt-0">
            <SendGridChecker />
          </TabsContent>

          <TabsContent value="brevo" className="mt-0">
            <BrevoChecker />
          </TabsContent>

          <TabsContent value="mailgun" className="mt-0">
            <MailgunChecker />
          </TabsContent>
        </Tabs>

        {/* Info Section */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-slate-800/40 border-slate-700/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-indigo-400" />
                <CardTitle className="text-white text-lg">Session Based</CardTitle>
              </div>
              <CardDescription className="text-slate-400">
                Data persists during your session but clears automatically when you refresh the page for security.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-slate-800/40 border-slate-700/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-emerald-400" />
                <CardTitle className="text-white text-lg">Bulk Operations</CardTitle>
              </div>
              <CardDescription className="text-slate-400">
                Check multiple credentials simultaneously with real-time status updates and progress tracking.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="bg-slate-800/40 border-slate-700/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-cyan-400" />
                <CardTitle className="text-white text-lg">7 Services</CardTitle>
              </div>
              <CardDescription className="text-slate-400">
                AWS, Twilio, Nexmo, SMTP, SendGrid, Brevo, and Mailgun all in one dashboard.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-slate-400 text-sm">
              API Credential Checker Dashboard - Session-based storage
            </p>
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="border-slate-600 text-slate-400">
                <Lock className="w-3 h-3 mr-1" />
                Client-Side Only
              </Badge>
            </div>
          </div>
        </div>
      </footer>

      {/* Global Checker Status Indicator */}
      <GlobalCheckerIndicator />
    </div>
  );
}

export default function App() {
  return (
    <CheckerProvider>
      <AppContent />
    </CheckerProvider>
  );
}
