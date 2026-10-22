# Redan Knowledge Base
# Source: "CHATBOT REQUIREMENTS ACCORDING TO AI" + "FAQS, GUIDELINES" (client-supplied),
# plus public facts from https://www.redan.co.zw/ (fetched 2026-10-03).
# Section 15 is from the regulator's site https://www.zera.co.zw/ (fetched 2026-10-03).
# This file is the bot's single source of truth for policy facts.
# Edit this file to change what the bot knows. No retraining required.

## 1. Company contact & escalation

- Head Office: 2 Northridge Close, Northridge Park, Borrowdale, Harare.
  For directions to Head Office, use the get_directions tool (to: "Head
  Office"); it routes to Northridge Close on the map.
- Customer support (RedanFlexi): available 24/7 via the in-app online chat.
- Email: customersupport@redan.co.zw
- Phone: 08677 009583
- WhatsApp: +263 772 186 186 (https://wa.me/263772186186)
- Sales enquiries email: sales@redan.co.zw
- Bulk / commercial enquiries: Commercial Department. Email sales@redan.co.zw.
  [DATA GAP] The source FAQ says "NB To input phone numbers" — the Commercial
  Department's direct number was never supplied. Do not invent one. Give the
  sales email, offer the general support channels above, and offer a callback.
- Regional sales offices:
  - Masvingo: 2418 Clipsham Plots, Masvingo. Phone +263 713 437 302.
  - Mutare: 5029 Chimanimani Road, Mutare. Phone +263 20 66886.
  - Bulawayo: 143 J M N Nkomo Street, Bulawayo. Phone +263 776 575 842 /
    +263 292 66308.
- Online:
  - Website: https://www.redan.co.zw/
  - Web portal (fuel card / account login): https://webportal.redan.co.zw/
  - RedanFlexi Enterprise portal: https://flexienterprise.redan.co.zw/
  - RedanFlexi app — Android: https://play.google.com/store/apps/details?id=com.redanflexi.app
  - RedanFlexi app — iPhone: https://apps.apple.com/zw/app/redanflexi/id6746079352
  - Instagram: @redanzw

## 2. Paper coupons

- Where to get / buy coupons: when a customer asks for coupons, answer with
  exactly these two options, as a numbered list:
  1. Head Office
  2. Any Redan service station
- Minimum purchase: 20 litres. Maximum: no limit.
- Denominations:
  - Petrol (Blend): 5L and 20L.
  - Diesel: 20L.
  [CONFLICT] The requirements document lists Diesel as "5L, 20L" while the
  customer FAQ lists Diesel as 20L only. The FAQ is the customer-facing source,
  so answer 20L for diesel and offer to confirm with a human if the customer
  specifically asks about a 5L diesel coupon.
- Paper coupons come ONLY in these fixed denominations — 5L and 20L. There
  are no other paper sizes. Digital RedanFlexi coupons, by contrast, have NO
  denomination limit (any volume), which is why only digital coupons can be
  split or partially redeemed (section 6); paper coupons never can.
- Validity: 6 months from issue.
- Expired coupons (any expiry date other than June 2026): can be returned to
  Redan Head Office and revalidated. Revalidation is done at Head Office
  only — never tell a customer a station can revalidate a coupon.
- Coupons with an expiry date of June 2026 (this rule is ONLY for June 2026):
  give the customer TWO options, as a numbered list:
  1. Go to Redan Head Office (2 Northridge Close, Northridge Park,
     Borrowdale, Harare; Monday to Friday, 8 a.m. to 5 p.m.).
  2. Visit any nearby Redan service station and ask the attendant to do a
     coupon inquiry on the system.
  Then offer to find their nearest station if they tell you their town or
  suburb. Don't say the station will revalidate the coupons.
- Product conversion (e.g. Blend -> Diesel): must be done at Head Office. A Blend
  coupon cannot be redeemed for diesel until it has been converted.
- Redeemable at: Redan service stations nationwide.
- A paper coupon is redeemed for the FULL volume printed on it, in one
  redemption. It CANNOT be split or partially redeemed, and the attendant
  cannot "select a smaller volume" at the pump. (Splitting a coupon into the
  exact volume wanted is a digital-only feature — see RedanFlexi, section 6.)

## 3. Fuel cards

- Minimum purchase: 100 litres. Maximum: no limit.
- PIN protected; loaded with the volume purchased.
- Expiry: expire after 6 months of NON-USE (distinct from paper coupons, which
  expire 6 months from issue). Expired cards can be reactivated at Redan offices.
- Coupons and fuel cards are interchangeable facilities.

## 4. Opening an account (coupons / fuel cards)

How to answer an account-opening question:
- FIRST reply: give the customer a choice. List the three ways in one short
  line each, then ask which they prefer. Don't give the requirements, form
  link or other details yet. Use this wording:
  "You can open an account in one of three ways:
   1. Online — download the application form and email it to us
   2. At any Redan service station — set up instantly on the spot
   3. At Head Office — our staff will help you in person
   Which would you prefer? Reply 1, 2 or 3."
- NEXT reply, once they choose (a number, "online", "station", "head office"
  or similar), give the steps for that way only, plus the requirements below:
  1. Online: open the application form at the form link below, fill it in and
     email it to sales@redan.co.zw (it can also be handed in at Head Office).
  2. Station: walk into any Redan service station and the account is created
     instantly. Offer to find their nearest station.
  3. Head Office: 2 Northridge Close, Northridge Park, Borrowdale, Harare;
     open Monday to Friday, 8 a.m. to 5 p.m.; staff set the account up in
     person.
- If the customer already said how they want to open it (e.g. "How do I
  open an account online?"), skip the choice and answer for that way.

Application form (PDF, "Redan Pvt Ltd - Fuel Card Application Form", from the
form linked on redan.co.zw). This link opens the form in the browser, where
the customer can read it and download it with the download button. Checked
2026-10-22:
https://drive.google.com/file/d/1mr85GXm4yzNWd0FX8Ygxe3k8eNbtKj3z/view

Completed account opening forms go to: sales@redan.co.zw. Whenever you
mention the application form, give the form link as a markdown link to the
exact URL above (copy the whole URL, never the literal word "link"), e.g.
"[Open the application form](https://drive.google.com/file/d/1mr85GXm4yzNWd0FX8Ygxe3k8eNbtKj3z/view), fill it in and email it to sales@redan.co.zw."

What is needed to open an account (whichever way the customer chooses):
- Customer ID: a national ID or a passport (no other documents are listed).
- Details of a contact person (the person Redan should contact about the
  account).
- Name of the account.
- A minimum deposit equal to 20 litres of fuel.
List exactly these four items. The deposit can be paid using the coupon / fuel
card payment methods in section 5. Opening hours are in section 13.

## 5. Payment methods

- For coupons and fuel cards: USD bank transfer, card payments, mobile money, USD cash.
- For RedanFlexi: EcoCash, InnBucks, Visa, Mastercard, USD bank transfer, USD cash.
- Paying for fuel online via the website: IN DEVELOPMENT, not yet available.
  (RedanFlexi in-app purchase IS available — do not confuse the two.)
- Loading a RedanFlexi account with cash: possible at company offices, but the
  in-app payment methods are the recommended route.

## 6. RedanFlexi (digital platform)

Overview: a digital fuel coupon solution. Buy and send fuel from anywhere in the
world to people in Zimbabwe; recipients redeem at any Redan service station.

- App download (links from redan.co.zw, checked 2026-10-16):
  - Android (Google Play): https://play.google.com/store/apps/details?id=com.redanflexi.app
  - iPhone / iPad (Apple App Store): https://apps.apple.com/zw/app/redanflexi/id6746079352
  Whenever you tell a customer to download or get the RedanFlexi app, give
  BOTH links, labelled Android and iPhone. Customers can also search
  "RedanFlexi" in either store.
- Individual signup: download the app, register with your mobile phone details,
  fund via EcoCash, InnBucks, Visa or Mastercard.
- Splitting / partial redemption (digital coupons only): in the RedanFlexi app
  the customer has two options on a digital coupon —
  1. Split the coupon into the volumes they want BEFORE redeeming it, or
  2. Do a partial redemption: redeem only part of it now.
  Either way the remaining balance is kept (stored in the FlexiBucks wallet)
  for later use. A paper coupon cannot do this.
- Denominations: digital coupons have NO fixed denominations — any volume —
  unlike paper coupons, which exist only in 5L and 20L.
- Redemption can be interchanged between blend and diesel.
- Redemption is secured by a 5-digit redemption code with a full audit trail.
- The app has a built-in Site Locator.

### FlexiBucks
Redan's digital value units inside RedanFlexi.
- Earned as change at the pump (if the customer chooses), or by converting a
  RedanFlexi coupon into FlexiBucks.
- Main use: buying RedanFlexi coupons. Can also be redeemed at any Redan
  station, saved for later, or sent to and received from other people.
- FlexiBucks do NOT expire.
- Conversion works only between FlexiBucks and coupons (coupon -> FlexiBucks,
  FlexiBucks -> coupon). FlexiBucks can NOT be converted to USD or cash, and
  cannot be withdrawn. (Redan's website mentions converting "back to
  currency" — that is out of date; follow this rule.)

### Sending to someone without the app
A RedanFlexi coupon can be sent via WhatsApp or SMS to anyone, even if they do
not have the app. The recipient presents the confirmation / 5-digit code to the
fuel attendant at any Redan station.

### Sending fuel to a driver outside Harare
Use a RedanFlexi account to send fuel directly to the driver.

## 7. RedanFlexi Enterprise (corporate)

Portal: https://flexienterprise.redan.co.zw/
Enterprise enquiries: Nicole.Mazhambe@redan.co.zw

Features:
- Centralized dashboard to load corporate fuel reserves and manage distribution.
- Group & beneficiary management: group drivers, departments or branches and
  assign customized fuel allowances.
- Instant digital distribution to employees, drivers or contractors via app,
  SMS or WhatsApp.
- Real-time auditing and tracking of consumption, active allocations and
  redemption history nationwide.
- FlexiBucks & balance control, including re-conversions and automatic splitting
  of remaining balances on partial redemptions.

Opening an Enterprise account:
1. Go to https://flexienterprise.redan.co.zw/ and register with company details.
2. Navigate to "Load Account" and select "Request Top Up" to generate a quotation.
3. Pay by bank transfer, using the invoice number as the payment reference.
4. Upload proof of payment through the portal.
5. Once payment is approved the account balance updates automatically.

## 8. Redeeming a digital coupon (step by step)

1. Log in to the RedanFlexi app.
2. Select "My Coupons" from the bottom menu.
3. A window opens showing your coupons. Tap "Redeem" on the target coupon.
4. Select the Fuel Type (Blend or Diesel).
5. Select the redemption type.
6. Press "Next".
7. Confirm your redemption and submit the request.
8. Show the 5-digit generated code to the cashier at your chosen Redan station.

## 9. Redeeming paper coupons and fuel cards

- Paper coupon: present the coupon at the pump at any Redan service station.
  It is redeemed for the full volume printed on it, in a single redemption —
  a paper coupon cannot be split or partially redeemed.
- Fuel card: present the card and enter the PIN. The card is debited by the
  volume dispensed.
- Both are redeemable nationwide. The QR code on the Redan Locator page lists
  additional redemption locations.

## 10. Balance checking

The bot cannot read balances directly. Direct the customer to the correct
secure channel and never ask them for a PIN, password or full card number:
- RedanFlexi balance: log in to the RedanFlexi app.
- Fuel card balance: log in to the web portal (https://webportal.redan.co.zw/), or ask at any Redan station /
  Redan office.
- Paper coupon validity: check the expiry date printed on the coupon; if it has
  passed, it can be revalidated at Head Office.

## 11. Products

- Unleaded petrol: sold blended with ethanol, as required by Statutory
  Instrument 17 of 2013 (Petroleum (Mandatory Blending of Anhydrous Ethanol with
  Unleaded Petrol) Regulations).
- Diesel.
- Lubricants: available at all Redan service stations.
- Local names customers use (treat them exactly as the fuel they mean):
  - Diesel (Diesel 50): dhiziri, mafuta makobvu, muto mukobvu, or just
    makobvu / mukobvu ("thick").
  - Petrol (Petrol Blend): peturu, mafuta matete, muto mutete, or just
    matete / mutete ("thin"). Matete / mutete ALWAYS means petrol blend,
    never diesel.
- Partner services at selected stations: LPG, quick service restaurants
  (fast food) and pharmacies. Not every station has these — use the station
  locator tool rather than promising them at a specific site.
- Logistics: Redan runs its own delivery fleet of over 20 vehicles for bulk
  deliveries.

## 12. Bulk purchases

- Bulk fuel supply serves commercial, government and agricultural customers.
- Bulk discounts are offered.
- Minimum volume qualifying for a bulk discount enquiry: 5,000 litres.
- Enquiries are routed to the Commercial Department.

## 13. Operating hours

### Head Office
- Monday to Friday: 8:00 a.m. to 5:00 p.m.
- Closed on Saturdays and Sundays.

### Service stations
- Stations trade every day of the week, including weekends.
- Each station's hours, phone number and products come from the
  find_nearest_stations tool (Redan's station list). Always use the tool.
- Only if the tool result has no operating_hours, fall back to the hours
  published on https://www.redan.co.zw/locations: Skyway, Norton, Seventh
  Street and Westgate are open 24 hours. For any other station, say you don't
  have its hours and offer to connect a human. Never guess.
- Station addresses (from the Redan website):
  - Skyway: 16944 Cnr Airport Road & Dieppe, Harare Main Sorting Office roundabout.
  - Norton: 20365 CIPF Norton Shopping Mall, Norton.
  - Seventh Street: corner of Seventh Street and Jason Moyo Avenue, Harare.
  - Westgate: Westgate Complex, along Lomagundi Road after the roundabout.
  - Mazowe Mall: 124 Mazowe Walk, Mazowe (past Mazowe Dam, Bindura Road).
  - Triangle: Cnr Tanganda Ngundu & Hockey Roads, Triangle.
- Redan Westgate also sells Redan Ultra Unleaded Petrol and has Pizza Hut and
  KFC on site. Redan Seventh Street has a food court. Skyway offers free air
  checks; Norton offers free air and oil checks.

### What works outside office/station hours
- Account opening at Head Office: weekdays 8 a.m.–5 p.m. only.
- RedanFlexi in-app purchases and the in-app support chat: 24/7.

## 13a. Fuel contamination complaints

- If a customer says their vehicle was contaminated by fuel from a Redan
  station, the fuel is already in the tank and the damage has already been
  done. Do NOT tell the customer to stop using the fuel, not to drive, not to
  start the engine, or to drain the tank.
- Treat it as a complaint: acknowledge it, ask which station (if not said),
  give that station's details, and tell the customer to call the station on
  its site cell number — the station will guide them on what to do next.
- Do not admit fault, promise compensation, repairs or a refund, or speculate
  about the cause. The station deals with it.

## 14. About Redan

- Zimbabwean energy company, established 2001. Launched the original
  "Redan Coupon"; first service station (Amby, Msasa) opened 2004.
- Fuel Card introduced 2013; RedanFlexi is the current digital product.
- CEO: Tafadzwa Chigumbu.
- Mission: "To provide superior service and products to our customers. We
  enhance life on the move." Vision: "To be the leading and most exciting
  energy company in Zimbabwe." Values: responsibility, integrity, innovation,
  adaptability.
- Network size: 78 service stations nationwide (Redan's own station list,
  October 2026). The website's older figures (47, "over 60") are out of date.

## 15. Regulator: ZERA (Zimbabwe Energy Regulatory Authority)

ZERA is the government regulator for Zimbabwe's energy sector (electricity,
petroleum and LPG), established under the Energy Regulatory Authority Act
[Chapter 13:23] of 2011. ZERA is NOT part of Redan — never speak on ZERA's
behalf, and make clear it is a separate body.

### ZERA published fuel prices (effective 9 October 2026)
| Fuel | USD | ZWG |
|---|---|---|
| Petrol Blend (E20) | $2.05 / litre | ZWG 54.70 / litre |
| Diesel (D50) | $2.04 / litre | ZWG 54.55 / litre |
| LPG | $1.76 / kg | ZWG 47.01 / kg |

- ZERA revises these regularly (typically monthly). The effective date above
  is for keeping this table current — don't state it to customers when giving
  coupon or top-up prices.
- Buying coupons, topping up a fuel card, or topping up / buying fuel on
  RedanFlexi: the price per litre is ALWAYS ZERA's published price above, in
  USD, with NO date. NEVER use a station's pump price for these, and don't
  look up a station for them. E.g. 20L of diesel coupons = 20 x $2.04 =
  $40.80.
- Buying fuel at the pump at a particular station: use that station's own
  pump price from Redan's station list (find_nearest_stations).
- Also quote ZERA's prices when the customer asks about ZERA, or as a
  fallback if a station's pump price is missing.
- Only when the customer asks directly about ZERA's prices, give the
  effective date and say they can check the latest on https://www.zera.co.zw/.
- Blending ratio: ZERA lists petrol as "Petrol Blend (E20)", i.e. 20% ethanol
  and 80% unleaded petrol. This is the current blending ratio for Redan's
  blend petrol (see section 11 on mandatory blending). Diesel is not blended
  with ethanol; "D50" is diesel's grade label, not a blending ratio.

### Complaints and the regulator
- A complaint about Redan should go to Redan first: for a problem at a
  station, the customer contacts that station (see the complaint steps); for
  anything else, use escalate_to_human.
- Only if the customer asks how to complain to the regulator, give ZERA's
  channels: download the consumer complaints form at
  https://www.zera.co.zw/consumer-complaints/, or contact ZERA directly.
- ZERA's site does not state its complaint steps or response times — do not
  invent them.

ZERA contact details:
- Head Office: Stand 887-888, Corner Endeavour Crescent and Venture Close,
  Mount Pleasant, Harare.
- Phone: +263 242 780010
- Toll-free: Econet 0808 0136; NetOne 08010070; Telecel 0731 780 010
- WhatsApp: 0772 161 966
- Email: admin@zera.co.zw
- Other offices: Bulawayo, Mutare, Gweru.

### LPG safety (ZERA guidance)
- Use and store gas cylinders upright.
- Check for leaks with a cloth soaked in soapy water — bubbles mean a leak.
- If you suspect a leak: turn off the regulator, disconnect the cylinder, move
  it outdoors, open windows and doors, and do not use electrical switches or
  flames.
- Have regulators and hose pipes inspected by authorised dealers.
