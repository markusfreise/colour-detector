<?php
// Copy to config.php next to index.php and fill in. Never commit the real file.
// A provider or plan without its values is switched off and not offered in the app.
return [
    // Where the app is served, with a slash at the end. The API is expected under <app_url>api/.
    'app_url' => 'https://watercolourlove.markus-freise.de/',
    // SQLite file, outside the web root.
    'database' => '/home/www/pXXXXXX/colour-detector-accounts.sqlite',
    // Long random string; signs login states and hashes addresses for the rate limit.
    'secret' => 'CHANGE-ME-long-random-string',
    // Version of the privacy text a user agreed to. Change it when the text changes: everybody is asked again.
    'consent_version' => '2026-10',

    'mail' => [
        'from' => 'Watercolourlove <support@markus-freise.de>',
        // 'mail' sends with PHP mail(); a file path writes the message there instead (for local tests).
        'transport' => 'mail',
    ],

    // New accounts only by invitation: addresses on 'allow', or anybody who enters one of 'codes'
    // (case does not matter). Each code works once and gives a lifetime licence. Existing accounts
    // sign in as before. Leave it out to let everybody in.
    // 'invitation' => ['allow' => ['someone@example.org'], 'codes' => ['SPRING-PAINTERS']],

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
        'client_id' => '',   // the Services ID, e.g. de.markusfreise.watercolourlove.web
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
