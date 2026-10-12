"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  SendHorizontal,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Step = { tool: string; args: unknown; result: any; error?: boolean };
type Message = { role: "user" | "agent"; text: string; steps?: Step[]; error?: boolean };
type Status = { hasApiKey: boolean; model: string; tools: { name: string; description: string }[] };
type WalletInfo = { address: string | null; balance?: string };

const EXAMPLES = ["What's the weather in Mumbai?", "What's in your wallet?", "Roll a 20 sided dice"];

export default function Home() {
  const [status, setStatus] = useState<Status | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState<string | null>(null);
  const [connBalance, setConnBalance] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadWallet = () => fetch("/api/wallet").then((r) => r.json()).then(setWallet);

  useEffect(() => {
    fetch("/api/agent").then((r) => r.json()).then(setStatus);
    // The agent's server wallet is auto-created in the background so paid
    // tools keep working. The user never sees a "Create wallet" button.
    fetch("/api/wallet")
      .then((r) => r.json())
      .then(async (w) => {
        if (!w.address) {
          await fetch("/api/wallet", { method: "POST" });
          loadWallet();
        } else {
          setWallet(w);
        }
      });
    const eth = (window as any).ethereum;
    const onAccounts = (accs: string[]) => {
      setConnected(accs?.[0] ?? null);
      if (!accs?.[0]) setConnBalance(null);
    };
    eth?.on?.("accountsChanged", onAccounts);
    return () => eth?.removeListener?.("accountsChanged", onAccounts);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  // Connect the USER's browser wallet (display only). The agent still signs
  // paid API calls with its own server wallet in the background.
  async function connectWallet() {
    setConnecting(true);
    try {
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("No browser wallet found. Install MetaMask or Coinbase Wallet.");
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14a34" }] });
      } catch (switchErr: any) {
        if (switchErr?.code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x14a34",
              chainName: "Base Sepolia",
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://sepolia.base.org"],
              blockExplorerUrls: ["https://sepolia.basescan.org"],
            }],
          });
        } else throw switchErr;
      }
      setConnected(accounts[0]);
      const weiHex: string = await eth.request({
        method: "eth_getBalance",
        params: [accounts[0], "latest"],
      });
      setConnBalance(`${(parseInt(weiHex, 16) / 1e18).toFixed(4)} ETH`);
    } catch {
      setConnected(null);
    }
    setConnecting(false);
  }

  function disconnect() {
    setConnected(null);
    setConnBalance(null);
  }

  async function send(text: string) {
    if (!text.trim() || thinking) return;
    const history: Message[] = [...messages, { role: "user", text }];
    setMessages(history);
    setInput("");
    setThinking(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.filter((m) => !m.error).map(({ role, text }) => ({ role, text })) }),
      });
      const data = await res.json();
      setMessages((m) => [...m, data.error ? { role: "agent", text: data.error, error: true } : { role: "agent", text: data.answer, steps: data.steps }]);
      if (data.steps?.some((s: Step) => s.result?.payment)) loadWallet();
    } catch {
      setMessages((m) => [...m, { role: "agent", text: "Could not reach the server. Is `npm run dev` still running?", error: true }]);
    }
    setThinking(false);
  }

  const ready = Boolean(status?.hasApiKey);

  return (
    <main className="mx-auto flex min-h-screen max-w-[1520px] flex-col gap-10 px-4 py-8 md:px-12 md:py-12">
      {/* Header */}
      <header className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label>
            <img src="/risein-logo.svg" alt="Rise In" className="mr-3 h-5 w-auto" />
            <span className="text-foreground">/ Agentmaxxing</span>&nbsp;starter kit
          </Label>
          {status && <Label>Model: {status.model}</Label>}
        </div>
        <h1 className="text-5xl leading-[0.9] font-bold tracking-[-0.045em] uppercase md:text-7xl">
          Agentic <span className="text-primary">starter.</span>
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          An AI agent that uses your tools and pays for APIs with its own wallet.
        </p>
      </header>

      <div className="grid flex-1 gap-6 lg:grid-cols-[380px_1fr]">
        {/* Left: setup + tools */}
        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <SectionTitle num="01" title="Setup" />
            </CardHeader>
            <CardContent className="flex flex-col">
              <SetupStep number={1} title="Add your Gemini API key" done={ready}>
                {status && !ready && (
                  <p className="text-muted-foreground">
                    Paste it into <Code>.env</Code> as <Code>GEMINI_API_KEY</Code>, then restart <Code>npm run dev</Code>.{" "}
                    <a className="text-primary underline underline-offset-4" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                      Get a free key
                    </a>
                  </p>
                )}
                {ready && <p className="text-muted-foreground">Connected.</p>}
              </SetupStep>

              <SetupStep number={2} title="Connect your wallet" done={Boolean(connected)}>
                {!connected && (
                  <div className="flex flex-col gap-3">
                    <p className="text-muted-foreground">Connect your browser wallet to fund the agent on Base Sepolia.</p>
                    <Button onClick={connectWallet} disabled={connecting} className="w-fit font-mono tracking-wider uppercase">
                      <Wallet /> {connecting ? "Connecting..." : "Connect wallet"}
                    </Button>
                  </div>
                )}
                {connected && (
                  <div className="flex flex-col gap-3 border bg-background p-3">
                    <code className="truncate font-mono text-xs text-primary">{connected}</code>
                    <div className="flex items-center justify-between font-mono text-xs text-muted-foreground uppercase">
                      <span>
                        Balance <span className="text-foreground">{connBalance ?? "..."}</span>
                      </span>
                      <Button variant="ghost" size="icon-xs" onClick={disconnect} aria-label="Disconnect">
                        Disconnect
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Base Sepolia (chain 84532). Agent signs paid APIs with its own server wallet
                      {wallet?.address ? ` (${wallet.address.slice(0, 10)}...)` : ""} in the background.
                    </p>
                  </div>
                )}
                {wallet?.address && <WalletDetails wallet={wallet} onRefresh={loadWallet} />}
              </SetupStep>

              <SetupStep number={3} title="Chat with your agent" done={messages.some((m) => m.role === "agent" && !m.error)} last>
                <p className="text-muted-foreground">Pick an example prompt, or ask anything.</p>
              </SetupStep>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <SectionTitle num="02" title="Tools" />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {status?.tools.map((t) => (
                <div key={t.name}>
                  <p className="font-mono text-sm">
                    <span className="text-primary">&gt;</span> {t.name}
                  </p>
                  <p className="mt-1 text-muted-foreground">{t.description}</p>
                </div>
              ))}
              <p className="border-t pt-4 text-muted-foreground">
                Add your own in <Code>agent/tools.ts</Code>. Save, and it shows up here.
              </p>
            </CardContent>
          </Card>
        </aside>

        {/* Right: chat */}
        <Card className="flex h-[calc(100vh-4rem)] min-h-[560px] flex-col lg:sticky lg:top-8">
          <CardHeader className="border-b">
            <SectionTitle num="03" title="Chat" />
            <CardAction>
              <Button variant="ghost" size="sm" className="font-mono uppercase" onClick={() => setMessages([])} disabled={messages.length === 0 || thinking}>
                <RotateCcw /> Clear
              </Button>
            </CardAction>
          </CardHeader>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-5 px-4 py-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center gap-5 py-16 text-center">
                  <div className="flex size-12 items-center justify-center bg-primary text-primary-foreground">
                    <Bot className="size-6" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tracking-tight uppercase">Ask your agent something</p>
                    <p className="mt-1 text-muted-foreground">
                      {!ready
                        ? "Add your Gemini API key to start."
                        : !connected
                          ? "Tip: connect your wallet so you can fund the agent."
                          : "Pick an example to start."}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {EXAMPLES.map((e) => (
                      <Button key={e} variant="outline" onClick={() => send(e)} disabled={!ready} className="font-mono">
                        <span className="text-primary">&gt;</span> {e}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="max-w-[85%] self-end bg-primary px-4 py-2.5 font-medium text-primary-foreground">
                    {m.text}
                  </div>
                ) : (
                  <div key={i} className="flex max-w-[85%] gap-3 self-start">
                    <div className="flex size-8 shrink-0 items-center justify-center border">
                      <Bot className="size-4 text-primary" />
                    </div>
                    <div className="flex min-w-0 flex-col gap-2">
                      {m.steps?.map((s, j) => <ToolCall key={j} step={s} />)}
                      <div className={cn("px-4 py-2.5 whitespace-pre-wrap", m.error ? "flex gap-2 bg-destructive/10 text-destructive" : "bg-muted")}>
                        {m.error && <CircleAlert className="mt-0.5 size-4 shrink-0" />}
                        {m.text}
                      </div>
                    </div>
                  </div>
                )
              )}

              {thinking && (
                <p className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
                  agent is thinking <span className="inline-block h-4 w-2 animate-pulse bg-primary" />
                </p>
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <CardFooter className="border-t pt-4">
            <form
              className="flex w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <div className={cn("flex flex-1 items-center border border-input bg-background focus-within:border-primary", !ready && "opacity-50")}>
                <span className="pl-3 font-mono text-base whitespace-nowrap text-muted-foreground md:text-sm">~/agent $</span>
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={ready ? "ask your agent something..." : "add your Gemini API key to start"}
                  disabled={!ready}
                  className="h-11 border-0 bg-transparent font-mono focus-visible:ring-0 disabled:bg-transparent disabled:opacity-100 dark:bg-transparent dark:disabled:bg-transparent"
                />
              </div>
              <Button type="submit" className="h-auto px-5" disabled={!ready || thinking || !input.trim()} aria-label="Send">
                <SendHorizontal />
              </Button>
            </form>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="flex items-center font-mono text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">{children}</p>;
}

function SectionTitle({ num, title }: { num: string; title: string }) {
  return (
    <p className="font-mono text-xs font-medium tracking-[0.06em] uppercase">
      <span className="text-primary">{num}</span>
      <span className="ml-3 text-muted-foreground">{title}</span>
    </p>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>;
}

function SetupStep(props: { number: number; title: string; done: boolean; last?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center border-2 font-mono text-xs font-bold",
            props.done ? "border-primary bg-primary text-primary-foreground" : "border-primary text-primary"
          )}
        >
          {props.done ? <Check className="size-3.5" strokeWidth={3} /> : props.number}
        </span>
        {!props.last && <span className={cn("w-0.5 flex-1", props.done ? "bg-primary" : "bg-border")} />}
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-col gap-2", !props.last && "pb-6")}>
        <p className="font-bold tracking-tight uppercase">{props.title}</p>
        {props.children}
      </div>
    </div>
  );
}

function WalletDetails({ wallet, onRefresh }: { wallet: WalletInfo; onRefresh: () => void }) {
  const [copied, setCopied] = useState(false);
  const [funding, setFunding] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [fundError, setFundError] = useState<string | null>(null);
  const address = wallet.address!;

  function copy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Fund the agent from the USER's own browser wallet (MetaMask, Coinbase...).
  // This is a plain injected-wallet transfer, not the agent's server wallet.
  // (The installed @reown/walletkit is wallet-side — for building a wallet app.
  //  Dapp-side QR connect would need @reown/appkit + a cloud.reown.com project ID.)
  async function fund() {
    setFunding(true);
    setFundError(null);
    setTxHash(null);
    try {
      const eth = (window as any).ethereum;
      if (!eth) throw new Error("No browser wallet found. Install MetaMask or Coinbase Wallet.");
      const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
      if (!accounts?.[0]) throw new Error("No account connected.");
      // Ensure Base Sepolia (84532 = 0x14a34)
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x14a34" }],
        });
      } catch (switchErr: any) {
        if (switchErr?.code === 4902) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0x14a34",
              chainName: "Base Sepolia",
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://sepolia.base.org"],
              blockExplorerUrls: ["https://sepolia.basescan.org"],
            }],
          });
        } else throw switchErr;
      }
      const hash: string = await eth.request({
        method: "eth_sendTransaction",
        params: [{ from: accounts[0], to: address, value: "0x38d7ea4c68000" }], // 0.001 ETH
      });
      setTxHash(hash);
      setTimeout(onRefresh, 8000); // balance indexes after a few seconds
    } catch (err) {
      setFundError(err instanceof Error ? err.message : String(err));
    }
    setFunding(false);
  }

  return (
    <div className="flex flex-col gap-3 border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <code className="truncate font-mono text-xs text-primary">{address}</code>
        <Button variant="ghost" size="icon-xs" onClick={copy} aria-label="Copy address">
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <div className="flex items-center justify-between font-mono text-xs text-muted-foreground uppercase">
        <span>
          Balance <span className="text-foreground">{wallet.balance}</span>
        </span>
        <Button variant="ghost" size="icon-xs" onClick={onRefresh} aria-label="Refresh balance">
          <RefreshCw />
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 font-mono text-xs uppercase">
        <a className="inline-flex items-center gap-1 hover:text-primary" href={`https://sepolia.basescan.org/address/${address}`} target="_blank" rel="noreferrer">
          Explorer <ExternalLink className="size-3" />
        </a>
        <a className="inline-flex items-center gap-1 hover:text-primary" href="https://docs.base.org/base-chain/tools/network-faucets" target="_blank" rel="noreferrer">
          Get test ETH <ExternalLink className="size-3" />
        </a>
        <button onClick={fund} disabled={funding} className="inline-flex cursor-pointer items-center gap-1 hover:text-primary disabled:opacity-50">
          {funding ? "Funding..." : "Fund 0.001 ETH"}
        </button>
      </div>
      {txHash && (
        <a className="font-mono text-xs text-primary underline underline-offset-4" href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer">
          Funded: {txHash.slice(0, 10)}... — view on explorer
        </a>
      )}
      {fundError && <p className="font-mono text-xs text-destructive">{fundError}</p>}
      <p className="text-xs text-muted-foreground">Base Sepolia testnet (chain 84532). Saved in .agent-wallet.json.</p>
    </div>
  );
}

function ToolCall({ step }: { step: Step }) {
  const payment = step.result?.payment;
  return (
    <Collapsible className="border font-mono text-xs">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted">
        <ChevronRight className="size-3.5 transition-transform group-data-[panel-open]:rotate-90" />
        <span className="text-muted-foreground uppercase">Tool</span>
        <span className="text-primary">{step.tool}</span>
        {payment && <Badge className="ml-auto bg-blue font-mono text-foreground uppercase">Paid {payment.amount}</Badge>}
        {step.error && <Badge variant="destructive" className="ml-auto font-mono uppercase">Failed</Badge>}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2 border-t px-3 py-2">
        <Json label="Input" value={step.args} />
        <Json label="Output" value={step.result} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-muted-foreground uppercase">{label}</p>
      <pre className="overflow-x-auto bg-background p-2">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}
