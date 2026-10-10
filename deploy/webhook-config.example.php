<?php
// Copy to the web root as webhook-config.php and fill in. Never commit the real file.
return [
    'secret'   => 'CHANGE-ME-long-random-string',
    'repo_dir' => '/home/www/pXXXXXX/colour-detector',
    'branch'   => 'main',
    'log_file' => '/home/www/pXXXXXX/colour-detector-deploy.log',
];
