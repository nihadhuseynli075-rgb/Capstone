# Testing friends by hand

A checklist for trying Friends with two accounts on the real project. It takes
about fifteen minutes. Tick things off as you go, and write down anything that
does not match what it says you should see.

## Before you start

- [ ] **`supabase/run-all.sql` has been run** in the Supabase SQL editor
      (Dashboard → SQL Editor → New query → paste the whole file → Run). It is
      safe to run again, so if you are not sure, run it. Friends need two things
      from it: the friends table, and the usernames column on profiles. If
      either is missing, the Friends page shows a red message that ends with
      "run supabase/run-all.sql in the Supabase SQL editor". That is the cue.
- [ ] **The API is connected to Supabase.** `SUPABASE_SERVICE_ROLE_KEY` is in
      `.env` and the API has been restarted. Opening
      <http://localhost:4000/health> should say `"storageMode":"supabase"`. If
      it says `memory`, the Friends page will say friends need real accounts,
      and nothing else will work.
- [ ] **Two accounts.** Call them **A** and **B**. Make them with two different
      email addresses you can reach (Register page). If your project asks you to
      confirm the email after registering, confirm both.
- [ ] **Two browsers at once.** A in your normal window, B in a private window
      (or a second browser), so both stay signed in together.
- [ ] Give each account a different name, so you can tell them apart: "Test A"
      and "Test B" is fine.

Friends is on the dashboard (the **Friends** card), or type `#/friends` at the
end of the address.

## 1. An empty page

Signed in as A, open Friends.

- [ ] You see **Add a friend** and **Your friends**, and under the second one
      "No friends yet."
- [ ] There is no list of requests yet.

## 2. Give each account something to compare

Each of A and B: **New test**, any subject, **easy**, answer a few questions
(some right, some wrong), and hand it in. A and B should get different scores.
Finishing a test is what gives Friends numbers to show.

## 3. Send a request by email

Signed in as A, in **Email or username** type B's email address, in capitals if
you like, and press **Send request**.

- [ ] A green message: "Request sent to Test B. You will be friends once they
      accept."
- [ ] A new **Waiting for an answer** box appears with B's name, `@username` and
      a **Cancel request** button.
- [ ] B's email address is not written anywhere on the page.

Signed in as B, go to Friends (switch to the tab, or refresh).

- [ ] **Requests for you** shows A, with **Accept** and **Decline**.
- [ ] A's test figures are not shown yet. They only appear once you are friends.

## 4. Things that should be refused

Signed in as A, try each of these. The page should say exactly this, in red
under the box, and nothing else should change.

- [ ] A's own email address → "That is your own account. Add a friend instead."
- [ ] B's email again → "You have already sent them a request. They have not
      answered yet."
- [ ] An address nobody signed up with, such as `nobody@example.com` → "No
      ExamPeak account with that email or username."
- [ ] A username that does not exist, such as `@nobody.here` → the same "No
      ExamPeak account" message.
- [ ] Nothing at all (empty box) → "Enter an email address or a username,
      without spaces."

## 5. Accept, and compare

Signed in as B, press **Accept**.

- [ ] A's request disappears from **Requests for you**.
- [ ] **Your friends** now has A: name, `@username`, "Friends since" today's date.
- [ ] Under A there is a small table with two columns, **You** and A's name,
      and four rows: **Tests taken**, **Best score**, **Average**, **Last test**.
- [ ] The **You** column matches B's own **History** page (same number of tests,
      same best score), and A's column matches A's History.
- [ ] A friend with no tests yet shows a dash (-) in place of the figures, not 0%.

Signed in as A, refresh Friends.

- [ ] A's **Waiting for an answer** box is gone and B is in **Your friends**,
      with the same kind of table.

## 6. Already friends

Signed in as A, type B's email and send.

- [ ] "You are already friends."

## 7. Remove, with a confirm

Signed in as A, on B's card press **Remove**.

- [ ] The card does not remove B straight away. It asks "Remove Test B from your
      friends?" with **Yes, remove** and **Keep**.
- [ ] **Keep** puts the card back as it was.
- [ ] **Remove** then **Yes, remove** takes B out. Signed in as B and refreshing,
      A is gone from B's list too (removing ends it for both).
- [ ] Both accounts still have all their tests.

## 8. Add by username, and the other ways a request can end

Every account has a username. It is printed as `@something` under the name on
this page, and it can be changed on the **Profile** page. Find B's. Then,
signed in as A:

- [ ] Type B's username in capitals with the `@` in front (if it is `test.b`,
      type `@TEST.B`) → the same green "Request sent" message. The `@` and the
      capitals make no difference. Typing it with no `@` works too.

Signed in as B:

- [ ] Press **Decline**. The request disappears for both. Nothing is kept: A can
      send another one afterwards.

Signed in as A, send B another request, then:

- [ ] Press **Cancel request** (in **Waiting for an answer**). It disappears from
      A's page, and from B's after a refresh.

Now the crossing-over case. A sends B a request again. **Before B accepts**,
signed in as B type A's email and press **Send request**.

- [ ] B sees "You and Test A are now friends. They had already sent you a
      request." There is one friendship, not two requests.

Finish by removing the friendship, so you can repeat the test later.

## 9. Light and dark mode

Settings → **Theme**. Look at the Friends page, with at least one friend, one
incoming request and one waiting request showing, in **both** themes.

- [ ] Every word can be read: names, `@usernames`, the table, the red and green
      messages, and the grey hint under the box.
- [ ] The typing box and its grey "Their email or @username" hint are readable
      in dark mode, not a faint grey on dark blue.
- [ ] The round initials (or photo) beside each name are readable.
- [ ] The **Remove** box ("Remove ... from your friends?") is clear in both.

## 10. On a phone

Use your phone, or in Chrome press F12, then the phone-and-tablet icon, and
pick **iPhone 14 Pro** or set the width to 393.

- [ ] You never have to scroll sideways.
- [ ] Buttons are easy to hit with a thumb. **Send request**, **Accept** and
      **Decline** stretch across the width.
- [ ] A long name wraps onto the next line instead of running off the screen. In
      the comparison table it is cut short with "..." instead.
- [ ] The comparison table still shows both columns without anything on top of
      anything else. Dates may run onto two lines. That is fine.
- [ ] Tapping the box does not zoom the page in.

## 11. Other languages

Settings → **Language** → Русский, then Azərbaycanca, and look at Friends in
each.

- [ ] Every label, message and button is in that language, nothing left in
      English.
- [ ] The sentences with a name in them read properly ("Request sent: ...").

## 12. Signed out

Sign out and open `#/friends`.

- [ ] It says to sign in to add friends, with a **Sign in** button. It does not
      show an empty form.

## What friends can see of each other

A friend sees your name, `@username`, photo, and these four figures from your
finished tests: how many, best, average, and the date of the latest. Nobody ever
sees an email address, and nobody sees questions or answers. A request that has
not been accepted shows none of the figures.

"Best score" is the same test History highlights as your best. "Average" is the
mean percentage across all finished tests. "Last test" is the day the latest one
was handed in.

## Clean up

Remove any friendships you made. If these accounts were only for testing,
delete them from **Profile → Delete account**. That also removes their
friendships.

## If something goes wrong

Take a screenshot, note which step you were on and what the page said, and send
it over. A red message at the top of the Friends page, rather than inside the
box, is the server explaining itself, so include its exact words.
