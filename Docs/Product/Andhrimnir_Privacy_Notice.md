# DineSmart Privacy Notice

Applies to: the DineSmart (Andhrimnir) web app, version 2 (Sprint 5).
Owner: Navin Jairam (security and privacy). Last reviewed: 26 October 2026.

This notice explains what personal data DineSmart keeps about guests, why it
keeps it, who can see it, and how guests export or erase it. It describes the
code in this repository; a restaurant that runs DineSmart is the data
controller for its own guests and should publish its own contact details next
to this notice.

## 1. What we keep

| Data | Where it comes from | Why |
| --- | --- | --- |
| Name and email address | Registration or Google sign-in | Signing in, booking and order emails |
| Password hash (Argon2id) | Registration or a password change | Signing in. The password itself is never stored. |
| Google account ID | Google sign-in | Linking the Google account to the DineSmart account |
| Signed-in devices | Each sign-in | A coarse label such as "Chrome on macOS", so you can sign out devices. The full user agent is not stored. |
| Contact preferences | Account settings | Whether to send booking and order emails, and whether to send offers. Offers are off by default. |
| Bookings | The booking page | Party size, time, table, status, and any note, occasion or dietary note you add |
| Orders and bills | The menu and the restaurant | Items, options, special requests, totals and status |
| Notifications | DineSmart | Messages about your bookings and orders |

DineSmart does not ask for a phone number in the customer account. Walk-in
waitlist entries at the host stand may hold a name and an optional phone number
that staff type in; those are restaurant records, not part of the customer account.

## 2. What restaurant staff keep about a guest

Each restaurant keeps its own guest profile for the customers who have booked
or ordered there:

- how many times the guest was seated, when they last visited, and how many
  times they did not show up;
- tags chosen from a fixed list: VIP, regular, allergy, accessibility, family, business;
- an optional staff note of at most 500 characters.

Profiles are separate for each restaurant; one restaurant cannot see another's.
Reception, managers and administrators can read them. Kitchen staff and
customers cannot. Staff notes are never sent to the guest's own app. Staff
should write only what helps them serve the guest (for example "severe peanut
allergy" or "prefers a quiet table").

## 3. Who can see your data

- **You.** You can see your bookings, orders, bills, notifications and account
  settings.
- **The restaurant you booked or ordered with.** Its staff see your bookings and
  orders there, according to their role.
- **No one else.** DineSmart does not sell data or share it with advertisers.
  Email is sent through the email provider the restaurant configures. The local
  development build writes email to a test outbox and sends nothing.

## 4. How long we keep it

- Unfinished sign-ups (email not verified) are deleted automatically when their
  verification window ends.
- Sign-in sessions expire after seven days, or sooner when you sign out, change
  your password or delete your account.
- Bookings, orders and bills stay while your account exists, so you can see
  your history.
- After you delete your account, order and bill amounts stay without your name,
  because the restaurant must keep sales records (see section 5.3).

## 5. Your rights and how to use them

All of these are on the **Account settings** page (`/account`).

### 5.1 Correct your details

Change your name and contact preferences at any time. Your sign-in email cannot
be changed in the app yet; ask the restaurant if you need it changed.

### 5.2 Download your data

**Download my data** gives you a JSON file with:

- your account (name, email, sign-in method, when you joined, contact preferences);
- every booking (restaurant, time, party size, status, note, occasion, dietary note);
- every order with its items, options and special requests;
- every bill;
- your notifications.

The download does not include a restaurant's internal guest profile (visit
counts, tags, staff note). It also leaves out security data such as password
hashes and session tokens.

### 5.3 Delete your account

**Delete account** asks you to type `DELETE` and, if you sign in with a password,
to enter it. When you confirm:

- your name becomes "Deleted guest" and your email is replaced, so it can be
  used to register again;
- your password hash and Google link are removed, and every signed-in device is
  signed out;
- upcoming bookings are cancelled and their tables are released;
- notes, occasions and dietary notes are removed from all your bookings;
- special requests are removed from your order items;
- your notifications are deleted;
- every restaurant's guest profile for you (counts, tags and staff note) is deleted.

What stays: the dates, party sizes and statuses of past bookings, and order and
bill amounts. None of these are linked to your name or email any more.
Deletion cannot be undone.

### 5.4 Change your password

Change your password from Account settings by entering your current password.
Every other device is signed out at once. If you sign in with Google and want a
password as well, use **Forgot password**.

## 6. Security

- Passwords are hashed with Argon2id. Access tokens expire after 15 minutes.
  Refresh tokens are rotated on every use and stored only as hashes.
- Password sign-in locks for 15 minutes after five wrong passwords in a row.
- Changes to the menu, stock thresholds, booking rules and staff accounts are
  written to each restaurant's audit log.
- To report a security problem, follow `SECURITY.md`.

## 7. Changes

Changes to this notice are recorded in `CHANGELOG.md`, together with the
feature that caused them.
