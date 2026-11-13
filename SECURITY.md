# Security and privacy

short.it is intended for a trusted user on a local machine. It is not a multi-user server. Do not expose its port publicly or use a reverse proxy to share it. It binds to 127.0.0.1 and checks Host and Origin to reduce browser-based attacks on local services.

Project files, uploaded media, downloaded references, transcripts, chat history and session IDs are local runtime data and are excluded from Git. Never upload these folders in bug reports. The application does not read or publish provider credential files. External CLIs still use their configured authentication and can send project context to their services. Review their settings before using confidential material.

Agent execution is not a hardened sandbox. Permission behavior depends on the installed CLI, operating system and configured tools. Downloaded reference content is untrusted; the agent prompt instructs the agent not to follow instructions found in it. Do not run the application against untrusted local project directories or malicious symlinks. Media rendering uses third-party decoders and a browser; keep dependencies current.

Reference downloads are restricted to supported platform URLs, not arbitrary file paths. Downloads may fail because of platform authentication, availability or rate limits. Use content you are authorized to download and reuse. The application does not automatically load browser cookies.

To report a vulnerability, contact the repository maintainer through GitHub's private vulnerability reporting when available. Do not include credentials, personal paths, private media or exploitable details in a public issue.
