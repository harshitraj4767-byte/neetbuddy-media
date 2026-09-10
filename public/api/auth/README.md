# PHP auth API (Hostinger static hosting)

These endpoints let the built static site log users in against Hostinger MySQL,
without the Node/Worker server. Password and session formats are identical to
`src/lib/auth-mysql.functions.ts`, so accounts work in both places.

## Endpoints

| Path                     | Method | Purpose                                  |
| ------------------------ | ------ | ---------------------------------------- |
| `api/auth/login.php`     | POST   | `{ email, password }` -> session + profile |
| `api/auth/signup.php`    | POST   | `{ email, password, fullName? }`           |
| `api/auth/session.php`   | GET    | current session from the `nb_session` cookie |
| `api/auth/logout.php`    | POST   | clears the session                        |

## Setup on Hostinger

1. Upload the built site plus this `api/auth` folder to `public_html`.
2. Create `public_html/api/auth/config.local.php`:

   ```php
   <?php
   return [
     'host' => 'localhost',
     'port' => 3306,
     'database' => 'YOUR_DB',
     'user' => 'YOUR_USER',
     'password' => 'YOUR_PASSWORD',
   ];
   ```

   Use `localhost` on Hostinger — it is faster and needs no remote-MySQL allowlist.
3. Build the frontend with `VITE_AUTH_API_BASE=/api/auth` so it calls these files.
4. Serve over HTTPS: the session cookie is `Secure` whenever HTTPS is detected.
