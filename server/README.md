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
| Stripe | Run `php stripe-setup.php` in the folder of the API on the server (see below) | written by the script |
| Mail | The host must be able to send as the `from` address (SPF, DKIM) | `mail.from` |

## Stripe

Markus Freise is the seller; Stripe only takes the payments. Every checkout switches off Stripe's Managed Payments (Stripe as merchant of record), which is on by default for the account. The prices are gross and include 19 % German VAT, a fixed tax rate made by the script: below 10,000 EUR a year of sales to consumers in other EU countries the German VAT applies to all. Above that, switch to the VAT of the buyer's country (Stripe Tax and the EU One-Stop Shop). At checkout the buyer ticks that the app is unlocked at once and that this ends the right of withdrawal (terms, section 6).

On the server, in the folder of the API:

```
php stripe-setup.php    # asks for the secret key without showing it
```

A restricted key (`rk_live_...`) works, with these permissions (everything else "None"):

| Resource | Permission | Used by |
|---|---|---|
| Products, Prices, Tax rates | Write | setup |
| Webhook endpoints | Write | setup |
| Customer portal (billing portal configurations and sessions) | Write | setup, "Manage subscription" |
| Checkout Sessions | Write | buying |
| Customers | Write | buying |
| Subscriptions | Read | webhook |

It creates the product, the three prices, the 19 % VAT rate, the webhook to `<app_url>api/stripe/webhook` and the customer portal (cancel at the end of the period, switch between monthly and yearly, invoices, card), reuses what is already there, and writes key, webhook secret and price IDs into `config.php`. Run it again after changing a price in `PLANS`; the old price stays for its existing subscribers. With a `sk_test_` key it sets up the test mode the same way.

In the Stripe dashboard, once: public details (terms and privacy URL, support address) and the VAT ID on the invoices.

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
- Sign-in with Google, Meta and Apple is written to the providers' documentation but has not been run against the real services yet. The Stripe checkout, the webhook and `stripe-setup.php` were run against Stripe's test mode on 2026-10-15.
