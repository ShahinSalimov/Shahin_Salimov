"""Curated MITRE ATT&CK Enterprise catalog used to ground Agent 2.

The model may only emit technique IDs that exist here; names and tactics are
overwritten from this catalog after the model responds, so the dashboard and
STIX exports never carry a hallucinated or mistyped ATT&CK reference.

The subset covers the techniques that dominate dark-web, credential-leak,
initial-access-broker and vulnerability-exploitation intelligence. Extending
it is a data change only (or replace with the full ATT&CK STIX bundle).
"""

from __future__ import annotations

from dataclasses import dataclass

TACTICS: dict[str, str] = {
    "TA0043": "Reconnaissance",
    "TA0042": "Resource Development",
    "TA0001": "Initial Access",
    "TA0002": "Execution",
    "TA0003": "Persistence",
    "TA0004": "Privilege Escalation",
    "TA0005": "Defense Evasion",
    "TA0006": "Credential Access",
    "TA0007": "Discovery",
    "TA0008": "Lateral Movement",
    "TA0009": "Collection",
    "TA0011": "Command and Control",
    "TA0010": "Exfiltration",
    "TA0040": "Impact",
}
TACTIC_ORDER = list(TACTICS.keys())


@dataclass(frozen=True, slots=True)
class Technique:
    id: str
    name: str
    tactic_ids: tuple[str, ...]
    keywords: tuple[str, ...] = ()

    @property
    def url(self) -> str:
        return "https://attack.mitre.org/techniques/" + self.id.replace(".", "/") + "/"

    def to_dict(self) -> dict[str, object]:
        return {
            "technique_id": self.id,
            "technique_name": self.name,
            "tactics": [{"tactic_id": t, "tactic": TACTICS[t]} for t in self.tactic_ids],
            "url": self.url,
        }


_T = Technique
_CATALOG: list[Technique] = [
    _T("T1595", "Active Scanning", ("TA0043",), ("scan", "scanner", "masscan", "shodan")),
    _T("T1595.002", "Vulnerability Scanning", ("TA0043",), ("vulnerability scan", "nuclei", "mass exploitation")),
    _T("T1589", "Gather Victim Identity Information", ("TA0043",), ("employee list", "email list", "osint")),
    _T("T1583", "Acquire Infrastructure", ("TA0042",), ("bulletproof", "vps", "domain registration")),
    _T("T1586", "Compromise Accounts", ("TA0042",), ("compromised account", "hijacked account")),
    _T("T1588", "Obtain Capabilities", ("TA0042",), ("buy tool", "malware-as-a-service")),
    _T("T1588.005", "Exploits", ("TA0042",), ("exploit for sale", "0day", "zero-day", "poc", "exploit kit")),
    _T("T1588.006", "Vulnerabilities", ("TA0042",), ("vulnerability information", "cve")),
    _T("T1650", "Acquire Access", ("TA0042",), ("initial access broker", "access for sale", "iab")),
    _T("T1190", "Exploit Public-Facing Application", ("TA0001",), ("rce", "sqli", "sql injection", "web server", "nginx", "apache", "public-facing")),
    _T("T1133", "External Remote Services", ("TA0001", "TA0003"), ("vpn", "rdp", "citrix", "remote access")),
    _T("T1078", "Valid Accounts", ("TA0005", "TA0003", "TA0004", "TA0001"), ("valid credentials", "stolen credentials", "login")),
    _T("T1078.004", "Cloud Accounts", ("TA0005", "TA0003", "TA0004", "TA0001"), ("aws", "iam", "azure ad", "cloud account")),
    _T("T1566", "Phishing", ("TA0001",), ("phishing",)),
    _T("T1566.001", "Spearphishing Attachment", ("TA0001",), ("malicious attachment", "macro")),
    _T("T1566.002", "Spearphishing Link", ("TA0001",), ("phishing link", "credential harvesting page")),
    _T("T1195", "Supply Chain Compromise", ("TA0001",), ("supply chain",)),
    _T("T1195.002", "Compromise Software Supply Chain", ("TA0001",), ("npm package", "pypi", "backdoored package", "dependency")),
    _T("T1199", "Trusted Relationship", ("TA0001",), ("msp", "third party", "vendor access")),
    _T("T1059", "Command and Scripting Interpreter", ("TA0002",), ("command execution", "shell")),
    _T("T1059.001", "PowerShell", ("TA0002",), ("powershell",)),
    _T("T1059.004", "Unix Shell", ("TA0002",), ("bash", "/bin/sh", "reverse shell")),
    _T("T1059.006", "Python", ("TA0002",), ("python script",)),
    _T("T1203", "Exploitation for Client Execution", ("TA0002",), ("browser exploit", "document exploit")),
    _T("T1204", "User Execution", ("TA0002",), ("user opens", "lure")),
    _T("T1053", "Scheduled Task/Job", ("TA0002", "TA0003", "TA0004"), ("scheduled task",)),
    _T("T1053.003", "Cron", ("TA0002", "TA0003", "TA0004"), ("cron", "crontab")),
    _T("T1505.003", "Web Shell", ("TA0003",), ("webshell", "web shell")),
    _T("T1098", "Account Manipulation", ("TA0003", "TA0004"), ("add key", "access key creation", "mfa device")),
    _T("T1136", "Create Account", ("TA0003",), ("new user", "create account", "backdoor account")),
    _T("T1543", "Create or Modify System Process", ("TA0003", "TA0004"), ("systemd", "service install")),
    _T("T1068", "Exploitation for Privilege Escalation", ("TA0004",), ("privilege escalation", "lpe", "container escape", "kernel exploit")),
    _T("T1611", "Escape to Host", ("TA0004",), ("container escape", "runc", "docker escape")),
    _T("T1548", "Abuse Elevation Control Mechanism", ("TA0004", "TA0005"), ("sudo", "setuid")),
    _T("T1562", "Impair Defenses", ("TA0005",), ("disable logging", "cloudtrail")),
    _T("T1562.001", "Disable or Modify Tools", ("TA0005",), ("disable edr", "kill av")),
    _T("T1070", "Indicator Removal", ("TA0005",), ("clear logs", "delete logs")),
    _T("T1027", "Obfuscated Files or Information", ("TA0005",), ("obfuscated", "packed", "encoded payload")),
    _T("T1556", "Modify Authentication Process", ("TA0006", "TA0005", "TA0003"), ("auth bypass", "pam backdoor")),
    _T("T1110", "Brute Force", ("TA0006",), ("brute force",)),
    _T("T1110.003", "Password Spraying", ("TA0006",), ("password spray",)),
    _T("T1110.004", "Credential Stuffing", ("TA0006",), ("credential stuffing", "combolist", "combo list")),
    _T("T1003", "OS Credential Dumping", ("TA0006",), ("credential dump", "lsass", "/etc/shadow", "mimikatz")),
    _T("T1552", "Unsecured Credentials", ("TA0006",), ("hardcoded", "exposed secret", "leaked key")),
    _T("T1552.001", "Credentials In Files", ("TA0006",), (".env", "config file", "credentials file")),
    _T("T1552.005", "Cloud Instance Metadata API", ("TA0006",), ("imds", "169.254.169.254", "metadata service")),
    _T("T1555", "Credentials from Password Stores", ("TA0006",), ("password manager", "browser passwords")),
    _T("T1528", "Steal Application Access Token", ("TA0006",), ("oauth token", "access token", "api token")),
    _T("T1539", "Steal Web Session Cookie", ("TA0006",), ("session cookie", "infostealer", "stealer logs")),
    _T("T1212", "Exploitation for Credential Access", ("TA0006",), ("auth bypass exploit",)),
    _T("T1621", "Multi-Factor Authentication Request Generation", ("TA0006",), ("mfa fatigue", "push bombing")),
    _T("T1046", "Network Service Discovery", ("TA0007",), ("port scan", "service discovery")),
    _T("T1082", "System Information Discovery", ("TA0007",), ("uname", "system info")),
    _T("T1087", "Account Discovery", ("TA0007",), ("enumerate users", "list users")),
    _T("T1526", "Cloud Service Discovery", ("TA0007",), ("enumerate services", "cloud discovery")),
    _T("T1580", "Cloud Infrastructure Discovery", ("TA0007",), ("describe-instances", "list buckets", "enumerate ec2")),
    _T("T1021", "Remote Services", ("TA0008",), ("lateral movement",)),
    _T("T1021.004", "SSH", ("TA0008",), ("ssh", "openssh")),
    _T("T1210", "Exploitation of Remote Services", ("TA0008",), ("wormable", "internal exploit")),
    _T("T1005", "Data from Local System", ("TA0009",), ("local files",)),
    _T("T1213", "Data from Information Repositories", ("TA0009",), ("confluence", "sharepoint", "jira")),
    _T("T1530", "Data from Cloud Storage", ("TA0009",), ("s3 bucket", "blob storage", "gcs bucket")),
    _T("T1071", "Application Layer Protocol", ("TA0011",), ("c2", "command and control", "beacon")),
    _T("T1071.001", "Web Protocols", ("TA0011",), ("https c2", "http beacon")),
    _T("T1090", "Proxy", ("TA0011",), ("proxy", "residential proxy")),
    _T("T1105", "Ingress Tool Transfer", ("TA0011",), ("download payload", "wget", "curl")),
    _T("T1572", "Protocol Tunneling", ("TA0011",), ("tunnel", "ngrok", "dns tunneling")),
    _T("T1041", "Exfiltration Over C2 Channel", ("TA0010",), ("exfiltrate", "exfiltration")),
    _T("T1048", "Exfiltration Over Alternative Protocol", ("TA0010",), ("ftp exfil", "dns exfil")),
    _T("T1537", "Transfer Data to Cloud Account", ("TA0010",), ("copy snapshot", "share snapshot", "attacker bucket")),
    _T("T1567", "Exfiltration Over Web Service", ("TA0010",), ("upload to", "file sharing")),
    _T("T1567.002", "Exfiltration to Cloud Storage", ("TA0010",), ("mega.nz", "rclone")),
    _T("T1485", "Data Destruction", ("TA0040",), ("wiper", "delete data")),
    _T("T1486", "Data Encrypted for Impact", ("TA0040",), ("ransomware", "encrypt files", "locker")),
    _T("T1490", "Inhibit System Recovery", ("TA0040",), ("delete backups", "shadow copies")),
    _T("T1496", "Resource Hijacking", ("TA0040",), ("cryptominer", "xmrig", "mining")),
    _T("T1498", "Network Denial of Service", ("TA0040",), ("ddos", "botnet flood")),
    _T("T1499", "Endpoint Denial of Service", ("TA0040",), ("crash", "resource exhaustion")),
    _T("T1657", "Financial Theft", ("TA0040",), ("extortion", "fraud", "wire transfer")),
]

CATALOG: dict[str, Technique] = {t.id: t for t in _CATALOG}


def get_technique(technique_id: str) -> Technique | None:
    return CATALOG.get(technique_id.strip().upper())


def search_techniques(query: str, limit: int = 8) -> list[Technique]:
    """Rank techniques by keyword/name overlap with a free-text query."""
    terms = [t for t in query.lower().replace(",", " ").split() if len(t) > 2]
    q = query.lower()
    scored: list[tuple[int, Technique]] = []
    for tech in _CATALOG:
        score = 0
        name = tech.name.lower()
        for kw in tech.keywords:
            if kw in q:
                score += 3
        for term in terms:
            if term in name:
                score += 2
            elif any(term in kw for kw in tech.keywords):
                score += 1
        if score:
            scored.append((score, tech))
    scored.sort(key=lambda pair: (-pair[0], pair[1].id))
    return [tech for _, tech in scored[:limit]]
