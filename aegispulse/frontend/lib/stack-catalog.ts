import type { StackComponent } from "./types";

export interface CatalogItem extends StackComponent {
  group: string;
}

// Keys match backend agents/stack_matching.py STACK_ALIASES.
export const STACK_CATALOG: CatalogItem[] = [
  { group: "Cloud", key: "aws", label: "AWS", version: null },
  { group: "Cloud", key: "azure", label: "Microsoft Azure", version: null },
  { group: "Cloud", key: "gcp", label: "Google Cloud", version: null },
  { group: "Operating Systems", key: "ubuntu", label: "Ubuntu 22.04 LTS", version: "22.04" },
  { group: "Operating Systems", key: "debian", label: "Debian 12", version: "12" },
  { group: "Operating Systems", key: "rhel", label: "RHEL / Rocky 9", version: "9" },
  { group: "Operating Systems", key: "windows_server", label: "Windows Server 2022", version: "2022" },
  { group: "Edge & Web", key: "nginx", label: "Nginx", version: "1.24" },
  { group: "Edge & Web", key: "apache", label: "Apache httpd", version: "2.4" },
  { group: "Edge & Web", key: "openssh", label: "OpenSSH", version: "8.9p1" },
  { group: "Edge & Web", key: "fortinet", label: "FortiGate VPN", version: null },
  { group: "Data", key: "postgresql", label: "PostgreSQL", version: "16" },
  { group: "Data", key: "mysql", label: "MySQL / MariaDB", version: "8" },
  { group: "Data", key: "redis", label: "Redis", version: "7" },
  { group: "Data", key: "mongodb", label: "MongoDB", version: "7" },
  { group: "Containers", key: "docker", label: "Docker", version: "24" },
  { group: "Containers", key: "kubernetes", label: "Kubernetes", version: "1.29" },
  { group: "Containers", key: "vmware", label: "VMware ESXi", version: "8" },
  { group: "Application", key: "react", label: "React / Next.js", version: "18" },
  { group: "Application", key: "nodejs", label: "Node.js", version: "20" },
  { group: "Application", key: "python", label: "Python / Django", version: "3.11" },
  { group: "Application", key: "java", label: "Java / Spring", version: "17" },
  { group: "DevOps & Identity", key: "jenkins", label: "Jenkins", version: null },
  { group: "DevOps & Identity", key: "gitlab", label: "GitLab", version: null },
  { group: "DevOps & Identity", key: "github", label: "GitHub Actions", version: null },
  { group: "DevOps & Identity", key: "okta", label: "Okta", version: null },
  { group: "DevOps & Identity", key: "exchange", label: "Exchange Server", version: null },
];

export const CATALOG_GROUPS = Array.from(new Set(STACK_CATALOG.map((c) => c.group)));
