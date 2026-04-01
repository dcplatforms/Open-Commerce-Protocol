# Security Overview

Security is a foundational pillar of the Open Commerce Protocol (OCP). The SDK is designed with a **Zero Trust** architecture, incorporating multiple layers of protection to ensure the integrity, confidentiality, and authority of all autonomous commerce transactions.

## The Last Line of Defense (Mandate-Enforced)

OCP implements the **"Last Line of Defense"** principle through cryptographic validation. The Secure Enclave (Vault) never signs a transaction unless it passes a validation check against a signed **AP2 Mandate**. This ensures that even if an agent's logic is compromised, it cannot spend beyond its authorized budget or interact with unauthorized merchants.

### STRICT_MANDATE_MODE

To enforce absolute security, OCP supports a `STRICT_MANDATE_MODE`. When enabled:
*   Every signing request to the Tokenization Service **must** include a valid, signed Mandate.
*   Requests without a mandate will be rejected immediately, preventing "naked" transactions.

## Core Security Features

*   **Secure Enclaves (Simulated):** OCP leverages the concept of secure enclaves to perform cryptographic operations, such as signing blockchain transactions, without ever exposing private keys to the host environment. The `TokenizationService`'s `signWithToken` method simulates this by integrating with a secure vaulting solution like Basis Theory.
*   **PCI-Compliant Tokenization:** Integration with PCI-compliant vaulting solutions (e.g., Basis Theory via `TokenizationService`) ensures that raw sensitive payment card data is never stored on your servers. Instead, it is replaced with secure tokens, drastically minimizing your PCI DSS compliance scope.
*   **Strong Encryption:**
    *   **Data at Rest:** All sensitive data stored by OCP services should be encrypted using industry-standard AES-256-GCM encryption (dependent on database configuration and vaulting solution).
    *   **Data in Transit:** All communication with OCP APIs mandates TLS 1.3 encryption (handled by your server environment and Express setup), protecting data from eavesdropping and tampering during transmission.
*   **Immutable Audit Logging:** Every transaction, ledger entry, and significant event within the OCP ecosystem is recorded in an immutable audit log (dependent on `WalletService`'s database integration and `logger` module). This provides a verifiable trail for forensic analysis, compliance, and dispute resolution.
*   **Policy Enforcement:** The `AgentService` enables granular control over autonomous agents through definable policies, including spending limits and authorized counterparties, preventing unauthorized or out-of-policy transactions.
*   **Rate Limiting:** API endpoints are protected with rate limiting (`express-rate-limit` middleware) to mitigate denial-of-service (DoS) attacks and prevent abuse.
*   **Security Headers (`helmet`):** The OCP API is configured with a suite of HTTP headers (via `helmet` middleware) to enhance security against common web vulnerabilities like XSS, clickjacking, and others.

## Secure Development Practices

When developing applications that integrate with OCP, it is crucial to adhere to secure coding practices:

*   **Input Validation:** Always validate and sanitize all input from users and external systems to prevent injection attacks and unexpected behavior (`joi` library is present in `package.json`).
*   **Least Privilege:** Ensure that your application components and integrated agents operate with the minimum necessary permissions.
*   **Error Handling:** Implement robust error handling that avoids exposing sensitive system information to users.
*   **Dependency Management:** Regularly update and scan your project dependencies for known vulnerabilities (`npm audit`).
*   **Authentication & Authorization:** Securely authenticate users and ensure they are authorized to perform requested actions (`jsonwebtoken` is present in `package.json`).

## Compliance

For information on OCP's compliance readiness and certifications, refer to the [Compliance and Auditing](compliance.md) section.
