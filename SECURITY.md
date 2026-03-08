# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |
| < 0.1   | No        |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in automigrate, please report it responsibly.

### How to Report

**Option 1 -- Email (preferred for sensitive issues):**

Send an email to **security@automigrate.dev** with:

- A description of the vulnerability
- Steps to reproduce
- The potential impact
- Any suggested fixes (optional)

**Option 2 -- GitHub Security Advisories:**

Use [GitHub Security Advisories](https://github.com/automigrate-tool/automigrate/security/advisories/new) to privately report the vulnerability.

### Do NOT

- Open a public GitHub issue for security vulnerabilities
- Disclose the vulnerability publicly before it has been addressed

## Response Timeline

| Stage              | Timeframe           |
| ------------------ | ------------------- |
| Acknowledgment     | Within 48 hours     |
| Initial assessment | Within 7 days       |
| Fix development    | Depends on severity |
| Security advisory  | Published with fix  |

We will keep you informed of progress throughout the process.

## What Counts as a Security Issue

automigrate processes source code files and generates transformed output. The following are considered security-relevant:

### In Scope

- **Code injection during transformation**: If the migration engine could be tricked into generating malicious code in the output files (e.g., through crafted input files that cause arbitrary code to appear in the Playwright output).
- **Path traversal**: If the tool could be made to read or write files outside the intended project directory (e.g., via crafted file paths in configuration or import statements).
- **Arbitrary code execution**: If processing a source file triggers execution of code within that file rather than just parsing and transforming it.
- **Dependency vulnerabilities**: Known vulnerabilities in automigrate's runtime dependencies (Babel, tree-sitter, etc.) that are exploitable through normal use of the tool.
- **Configuration injection**: If `.automigrate` config files could be crafted to cause unintended behavior beyond the documented configuration options.

### Out of Scope

- Vulnerabilities in the generated Playwright code that stem from the original source code (garbage in, garbage out).
- Issues in development-only dependencies that do not affect published builds.
- Denial of service through extremely large input files (the tool is expected to be run locally on trusted codebases).

## Responsible Disclosure Policy

We follow a coordinated disclosure process:

1. Reporter submits the vulnerability privately.
2. We acknowledge receipt and begin assessment.
3. We develop and test a fix.
4. We release the fix and publish a security advisory with credit to the reporter (unless anonymity is requested).
5. We request that the reporter waits until the fix is released before any public disclosure.

We aim to resolve critical vulnerabilities within 14 days and non-critical ones within 30 days of confirmed assessment.

## Recognition

We are grateful to security researchers who report vulnerabilities responsibly. With your permission, we will credit you in the security advisory and CHANGELOG.
