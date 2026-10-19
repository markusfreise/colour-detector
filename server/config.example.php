<?php
// Copy to config.php next to index.php and fill in. Never commit the real file.
// A provider or plan without its values is switched off and not offered in the app.
return [
    // Where the app is served, with a slash at the end. The API is expected under <app_url>api/.
    'app_url' => 'https://watercolourlove.de/',
    // SQLite file, outside the web root.
    'database' => '/home/www/pXXXXXX/colour-detector-accounts.sqlite',
    // Long random string; signs login states and hashes addresses for the rate limit.
    'secret' => 'CHANGE-ME-long-random-string',
    // Version of the privacy text a user agreed to. Change it when the text changes: everybody is asked again.
    'consent_version' => '2026-10',

    // The app itself (api/app/) and the mixing service (api/mix/) are for signed-in accounts. On a
    // development instance whose build has no accounts (no VITE_ACCOUNT_API), and for `npm run dev`
    // against a local API, set 'open' to true: then anyone may use them, and nothing is locked.
    // Never on the public host.
    // 'open' => true,
    // Hosts the app may call the mixing service from ("*.example.org": every host below it); default
    // watercolourlove.de, *.watercolourlove.de and *.croeso.de. Add the public host while the app
    // is served from another one, e.g. 'watercolourlove.markus-freise.de'.
    // 'mix_origins' => ['watercolourlove.de', '*.watercolourlove.de', '*.croeso.de'],
    // Keys for local builds, which have no such host: VITE_MIX_KEY in their .env.local. Long random strings.
    // 'mix_keys' => ['CHANGE-ME-long-random-string'],
    // Where answers of the mixing service are kept for a week (colours and paints, no picture);
    // default: a folder in the system's temporary directory.
    // 'mix_cache' => '/home/www/pXXXXXX/colour-detector-mix-cache',

    'mail' => [
        'from' => 'Watercolourlove <support@markus-freise.de>',
        // 'mail' sends with PHP mail(); a file path writes the message there instead (for local tests).
        'transport' => 'mail',
    ],

    // Invitation codes: anybody may sign up as a free account; a code entered when signing up makes
    // the account one with a lifetime licence. Each code works once; case does not matter.
    // 'invitation' => ['codes' => ['SPRING-PAINTERS']],

    // A personal key per address: entered in the code field, it signs that address in at once, as
    // paid, without a link by e-mail. Anybody who knows address and key is in that account.
    // 'keys' => ['someone@example.org' => 'secret'],

    // Only for a local run (app_url on localhost or *.test, requests from this machine): these
    // addresses are signed in at once without a link, 'paid' with a licence without end, 'free'
    // without one. For any other address the sign-in link is shown in the app instead of mailed.
    // 'local_test' => ['accounts' => ['someone@example.org' => 'paid', 'other@example.org' => 'free']],

    'google' => ['client_id' => '', 'client_secret' => ''],
    'meta' => ['client_id' => '', 'client_secret' => ''],
    'apple' => [
        'client_id' => '',   // the Services ID, for the web: e.g. de.markusfreise.watercolourlove.web
        'app_id' => '',      // the bundle ID, for Sign in with Apple in the native app: de.markusfreise.watercolourlove
        'team_id' => '',
        'key_id' => '',
        'key_file' => '',    // path of the .p8 key, outside the web root
    ],

    'stripe' => [
        'secret_key' => '',       // sk_test_... or sk_live_...
        'webhook_secret' => '',   // whsec_...
        // Price IDs from the Stripe dashboard, and the text shown on the button.
        'plans' => [
            'monthly' => ['price' => '', 'label' => ''],
            'yearly' => ['price' => '', 'label' => ''],
            'lifetime' => ['price' => '', 'label' => ''],
        ],
    ],
];
