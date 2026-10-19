# Account API

Small PHP service for sign-in and payment. No framework, no packages: PDO with SQLite, curl, openssl. Pictures never come here.

An account is an e-mail address, the consent given and what was paid for (`users`); plus the identifiers of Google, Apple and Meta (`identities`, with Apple's refresh token to take the sign-in back on deletion), and sessions, sign-in links and app handoffs, stored as hashes.

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
| Apple | developer.apple.com: the App ID `de.markusfreise.watercolourlove` with Sign in with Apple (as primary App ID), a Services ID grouped under it (the `client_id`) with domain and return address, a key (.p8) with Sign in with Apple for that primary App ID | `client_id`, `app_id` (the bundle ID, for the native app), `team_id`, `key_id`, `key_file` |
| Stripe | Run `php stripe-setup.php` in the folder of the API on the server (see below) | written by the script |
| Mail | The host must be able to send as the `from` address (SPF, DKIM) | `mail.from` |

Google needs only the web client: the native app signs in with Google through the same web flow, in a browser sheet. Its consent screen must be published ("In production"), with the app's home page, privacy policy and the domain `watercolourlove.de` as authorised domain; with scopes `openid email` Google does not review it.

Apple gives the same subject to the web and the app only when the Services ID is grouped under the app's App ID, so that one person has one account on both.

## The native app

The app has the same accounts. Its session is a bearer token (`Authorization: Bearer ...`), kept in the keychain; everything else is the same routes.

- **Sign in with Apple** happens in the app. It sends the code Apple gave it to `POST auth/apple/native`, which redeems it for the bundle ID (`apple.app_id`) and answers with a session.
- **Google** (and Meta) open the web flow in a browser sheet: `GET auth/<provider>/start?app=<challenge>`, where the challenge is the SHA-256 (base64url) of a secret only the app knows. The callback sends the browser to `de.markusfreise.watercolourlove://signed-in?code=...`, and the app collects the session with `POST auth/app/exchange` and its secret. The code works once, for five minutes.
- `GET me` lists the ways the app can offer under `appProviders`.
- Deleting the account takes back Apple's sign-ins at Apple (`auth/revoke`, Apple's rule for apps); the refresh token is kept for that alone.

A plan or licence bought on the web unlocks the app as well (App Review guideline 3.1.3(b), multiplatform services: the same full version can be bought in the app).

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
| Coupons, Promotion codes | Write | setup (early bird) |
| Webhook endpoints | Write | setup |
| Customer portal (billing portal configurations and sessions) | Write | setup, "Manage subscription" |
| Checkout Sessions | Write | buying |
| Customers | Write | buying |
| Subscriptions | Read | webhook |

It creates the product, a price for every product in `plans.json`, the 19 % VAT rate, the webhook to `<app_url>api/stripe/webhook` and the customer portal (cancel at the end of the period, switch between monthly and yearly, invoices, card), reuses what is already there, and writes key, webhook secret and price IDs into `config.php`. Run it again after changing a price in `PLANS`; the old price stays for its existing subscribers. With a `sk_test_` key it sets up the test mode the same way.

**Early bird.** `early_bird` in `plans.json` makes a promotion code (default `EARLYBIRD`): a percentage off the first payment of every plan of at least `minimum_amount` (the yearly plan and the lifetime licence, not the monthly plan or picture packs), for the first `max_redemptions` buyers, until the end of the day `ends`. Customers type it at checkout. A checkout that already carries the credit-pack deduction takes no code (Stripe allows one or the other). Changed terms make a new coupon and code on the next run; to end it early, deactivate the promotion code in the Stripe dashboard and set `active` to false. The pricing pages (`public/pricing/`, `public/de/preise/`) show it while it runs.

In the Stripe dashboard, once: public details (terms and privacy URL, support address) and the VAT ID on the invoices.

## Plans and what they unlock

`plans.json` holds the products (subscriptions, the lifetime licence, credit packs), the two groups of paid features (`picture`: what one picture needs, unlocked by a credit; `studio`: only with a plan) and the free limits. The app reads the same file (`src/lib/entitlements.js`), and `entitlements.php` decides with the same rules; `tests/entitlement-cases.json` checks both. A product is offered when it is `active` and has a Stripe price: `STRIPE_PRICE_<KEY>` in the environment (`pictures-5` → `STRIPE_PRICE_PICTURES_5`) or `stripe.prices` in `config.php`. The prices shown come from Stripe, not from the file or the translations.

## Picture credits

A credit unlocks the picture features (see `plans.json`) of one picture for good. Every account gets one free credit (`credits.welcome`), old accounts too, once. Packs are bought like the lifetime licence, with one payment; the webhook adds their credits once per checkout, however often Stripe reports it. A refund takes back credits in proportion to the money returned, never below 0; pictures already unlocked stay unlocked. Subscribers and licence holders spend no credits.

The server never sees a picture, nor its hash: the app sends `SHA-256(salt + ":" + SHA-256 of the photo's bytes)`, with a salt of its own for every account, so the same photo gives another key in another account.

`credit_ledger` holds every change of a balance with its reason (grant, purchase, spend, admin, refund); the balance is its sum. By hand, in the folder of the API:

```
php credits.php show someone@example.org
php credits.php grant someone@example.org 5 --reason="Workshop with ..."
php credits.php revoke someone@example.org 2 --reason="Given twice by mistake"
```

Database changes after the first tables are numbered migrations (`migrations.php`), run once each on the first request; the number reached is SQLite's `user_version`.

## Tests

`npm run test:server` (or `php server/tests/run.php`): no packages, every test on a new SQLite file.

## Vouchers

A voucher is a lifetime licence for one e-mail address. Make one on the server, in the folder of the API:

```
php voucher.php create someone@example.org   # prints the code once, e.g. WCL-7K2M-QX4D-9HTN
php voucher.php list
php voucher.php revoke someone@example.org   # removes unused vouchers of that address
```

The holder signs in with that address and enters the code under "Unlock everything". A code works once and only for the account with that address.

## Admin page

`<app_url>admin/` lists the accounts (search by address) and changes one by hand. Only for admins, signed in to the app as themselves; the account dialog in the app links to it.

- **Superadmins** are named in `config.php` (`superadmins`). They are always admins, are the only ones who can make others admins (role `user` or `admin`) or change another admin, and nobody can change or delete them on the page. Nobody acts on their own account there.
- **Status:** `regular` (what was paid for counts), `unlocked` (everything, as with a lifetime licence, without paying), `banned` (signed out at once, a running subscription ends at Stripe, never signs in again). A banned account that is deleted leaves a keyed hash of its address in `banned_emails`, so the address cannot sign up again; lifting a ban (status back to regular or unlocked) removes it.
- **E-mail address:** changed for the account; it must be free.
- **Download data:** the same JSON the user gets under "Download my data", plus role and status.
- **Log in as this user:** a session for that account in the admin's browser, for an hour, marked with the admin. The app shows a bar with "Back to admin", which ends it and signs the admin in again. While acting as somebody, the admin has no admin rights.
- **Back to free:** the subscription ends at Stripe at once, without a refund; licence and unlock are taken away; the account, its credits and unlocked pictures stay. Refunds are made in the Stripe dashboard.
- **Delete for good:** as when the user deletes the account (subscription ended, Apple sign-in revoked), after typing the address.

## Routes

`GET me` · `POST auth/magic` · `POST auth/magic/verify` · `GET auth/<provider>/start` · `GET|POST auth/<provider>/callback` · `POST auth/app/exchange` · `POST auth/apple/native` · `POST consent` · `POST logout` · `GET export` · `POST delete` · `POST billing/checkout` · `POST billing/portal` · `POST billing/voucher` · `POST credits/unlock` · `POST stripe/webhook` · `GET admin/users` · `GET admin/users/<id>/export` · `POST admin/users/<id>` (role, status, email) · `POST admin/users/<id>/free` · `POST admin/users/<id>/impersonate` · `POST admin/users/<id>/delete` · `POST admin/return`

## Limits

- The lock is in the browser: the free limits are checked by the app, which runs on the user's device. Somebody who changes the code in their browser can lift them. Nothing of value is on the server to protect.
- Sign-in with Google, Meta and Apple is written to the providers' documentation but has not been run against the real services yet. The Stripe checkout, the webhook and `stripe-setup.php` were run against Stripe's test mode on 2026-10-15.
