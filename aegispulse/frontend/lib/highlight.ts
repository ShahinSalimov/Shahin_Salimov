/**
 * Minimal, dependency-free syntax highlighter for the remediation terminal.
 * Produces tokens rendered as React spans (never via dangerouslySetInnerHTML),
 * so AI-generated content cannot inject markup into the dashboard.
 */
export interface Token {
  text: string;
  cls: string;
}

const BASH_KEYWORDS = new Set([
  "if", "then", "else", "elif", "fi", "for", "in", "do", "done", "while", "case", "esac", "function", "return",
  "local", "export", "set", "readonly", "exit", "until",
]);
const COMMAND_HINTS = new Set([
  "iptables", "ip6tables", "nft", "ufw", "systemctl", "nginx", "apt-get", "apt", "aws", "docker", "kubectl", "sed",
  "cp", "mv", "grep", "awk", "curl", "echo", "printf", "sudo", "chmod", "chown", "mkdir", "cat", "tee", "openssl",
  "sshd", "python3", "pip", "jq", "date", "test",
]);

export type Language = "bash" | "json" | "python" | "text";

export function detectLanguage(kind: string, content: string): Language {
  if (kind === "aws_waf" || kind === "aws_security_group") return "json";
  if (kind === "python") return "python";
  if (["bash", "iptables", "nftables", "ufw"].includes(kind)) return "bash";
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  return "text";
}

function highlightBashLine(line: string): Token[] {
  const tokens: Token[] = [];
  const re = /(#.*$)|("(?:[^"\\]|\\.)*"|'[^']*')|(\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\$\([^)]*\))|(\s--?[A-Za-z][\w-]*)|([A-Za-z_][\w.-]*)|(\s+)|(.)/g;
  let m: RegExpExecArray | null;
  let firstWord = true;
  while ((m = re.exec(line)) !== null) {
    const [text, comment, str, variable, flag, word, space] = m;
    if (comment) tokens.push({ text, cls: "text-slate-500 italic" });
    else if (str) tokens.push({ text, cls: "text-emerald-300" });
    else if (variable) tokens.push({ text, cls: "text-fuchsia-300" });
    else if (flag) tokens.push({ text, cls: "text-amber-200" });
    else if (word) {
      if (BASH_KEYWORDS.has(word)) tokens.push({ text, cls: "text-violet-300" });
      else if (firstWord || COMMAND_HINTS.has(word)) tokens.push({ text, cls: "text-cyan-300" });
      else tokens.push({ text, cls: "text-slate-200" });
      firstWord = false;
    } else if (space) tokens.push({ text, cls: "" });
    else {
      tokens.push({ text, cls: "text-slate-400" });
      if (text === "|" || text === ";" || text === "&") firstWord = true;
    }
  }
  return tokens;
}

function highlightJsonLine(line: string): Token[] {
  const tokens: Token[] = [];
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|(\s+)|(.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const [text, str, colon, num, lit] = m;
    if (str) {
      tokens.push({ text: str, cls: colon ? "text-cyan-300" : "text-emerald-300" });
      if (colon) tokens.push({ text: colon, cls: "text-slate-400" });
    } else if (num) tokens.push({ text, cls: "text-amber-200" });
    else if (lit) tokens.push({ text, cls: "text-violet-300" });
    else tokens.push({ text, cls: "text-slate-400" });
  }
  return tokens;
}

const PY_KEYWORDS = /^(def|class|import|from|as|return|if|elif|else|for|while|try|except|finally|with|raise|in|not|and|or|is|None|True|False|pass|lambda|async|await)$/;

function highlightPythonLine(line: string): Token[] {
  const tokens: Token[] = [];
  const re = /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([A-Za-z_]\w*)|(\d+(?:\.\d+)?)|(\s+)|(.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const [text, comment, str, word, num] = m;
    if (comment) tokens.push({ text, cls: "text-slate-500 italic" });
    else if (str) tokens.push({ text, cls: "text-emerald-300" });
    else if (word) tokens.push({ text, cls: PY_KEYWORDS.test(word) ? "text-violet-300" : "text-slate-200" });
    else if (num) tokens.push({ text, cls: "text-amber-200" });
    else tokens.push({ text, cls: "text-slate-400" });
  }
  return tokens;
}

export function highlight(content: string, language: Language): Token[][] {
  let text = content;
  if (language === "json") {
    try {
      text = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      /* show as-is if the model returned invalid JSON (validation flags it) */
    }
  }
  return text.split("\n").map((line) => {
    if (language === "bash") return highlightBashLine(line);
    if (language === "json") return highlightJsonLine(line);
    if (language === "python") return highlightPythonLine(line);
    return [{ text: line, cls: "text-slate-200" }];
  });
}
