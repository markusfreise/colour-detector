# Account API

Small PHP service for sign-in and payment. No framework, no packages: PDO with SQLite, curl, openssl. Pictures never come here.

An account is an e-mail address, the consent given and what was paid for (`users`); plus the identifiers of Google, Apple and Meta (`identities`), sessions and sign-in links, all stored as hashes.

## Switching accounts on

Accounts are **off** until both steps are done; the live site stays as it is.

1. On the server, copy `config.example.php` to `<web root>/api/config.php` and fill it in. A provider or plan without values is not offered.
2. Build the app with `VITE_ACCOUNT_API=api`, for example in `.env.production.local` in the checkout on the server.

`deploy/deploy.sh` copies this folder to `<web root>/api/` and keeps `config.php`.

## Local

```
cp server/config.example.php server/config.php   # app_url http://localhost:5173/, a database path, mail transport = a file
php -S 127.0.0.1:8787 server/index.php
npm run dev
```

On `localhost` and `*.test` the app opens without signing in. Add `?login` to the address to see the sign-in: http://localhost:5173/?login. With the mail transport set to a file, the sign-in link is written there; add `?login` before the `#` when opening it.

## What to register

All redirect addresses are `<app_url>api/auth/<provider>/callback`.

| Service | Where | What goes into `config.php` |
|---|---|---|
| Google | Google Cloud console, OAuth client of type "Web application", scopes `openid email` | `client_id`, `client_secret` |
| Meta | developers.facebook.com, app with "Facebook Login", permission `email` | `client_id` (app ID), `client_secret` |
| Apple | developer.apple.com: an App ID with Sign in with Apple, a Services ID (the `client_id`) with domain and return address, a key (.p8) | `client_id`, `team_id`, `key_id`, `key_file` |
| Stripe | Three prices (monthly and yearly recurring, lifetime one-time); a webhook to `<app_url>api/stripe/webhook` with the events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`; the customer portal switched on | `secret_key`, `webhook_secret`, the price IDs and button texts |
| Mail | The host must be able to send as the `from` address (SPF, DKIM) | `mail.from` |

## Vouchers

A voucher is a lifetime licence for one e-mail address. Make one on the server, in the folder of the API:

```
php voucher.php create someone@example.org   # prints the code once, e.g. WCL-7K2M-QX4D-9HTN
php voucher.php list
php voucher.php revoke someone@example.org   # removes unused vouchers of that address
```

The holder signs in with that address and enters the code under "Unlock everything". A code works once and only for the account with that address.

## Routes

`GET me` · `POST auth/magic` · `POST auth/magic/verify` · `GET auth/<provider>/start` · `GET|POST auth/<provider>/callback` · `POST consent` · `POST logout` · `GET export` · `POST delete` · `POST billing/checkout` · `POST billing/portal` · `POST billing/voucher` · `POST stripe/webhook`

## Limits

- The lock is in the browser: the free limits are checked by the app, which runs on the user's device. Somebody who changes the code in their browser can lift them. Nothing of value is on the server to protect.
- Sign-in with Google, Meta and Apple and the Stripe checkout are written to the providers' documentation but have not been run against the real services yet.
