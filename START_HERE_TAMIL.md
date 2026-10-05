# Navin CRM — தொடங்குவது எப்படி

இந்த ZIP-ல் frontend, backend இரண்டின் source code-ம் உள்ளது. Database-க்கு நீங்கள் அமைக்கும் MongoDB Atlas பயன்படுத்தப்படும். பழைய live CRM இந்த code-னால் மாற்றப்படவில்லை.

1. ZIP-ஐ extract செய்யவும். Node.js 24 install செய்த கணினியில் `navin-crm-mern` folder-ஐ திறக்கவும்.
2. அந்த folder-ல் terminal திறந்து `npm ci` இயக்கவும்.
3. `.env.example` file-ஐ copy செய்து `.env` என்று பெயரிடவும்.
4. `.env`-ல் `MONGODB_URI` மதிப்பை உங்கள் Atlas connection string-ஆக மாற்றவும். Database name `navin_crm` இருக்க வேண்டும். Password-ஐ chat-ல் அனுப்ப வேண்டாம்.
5. `npm run build` இயக்கவும். பிறகு `npm start` இயக்கவும்.
6. Browser-ல் `http://localhost:3000` திறக்கவும்.
7. அதே project folder-ல் மற்றொரு terminal திறந்து, கீழே உள்ள example email/name-ஐ உங்கள் விவரங்களால் மாற்றி இயக்கவும்:

```bash
npm run bootstrap -- --email you@yourcompany.com --name "Your Name" --print-link
```

Terminal-ல் வரும் முழு private link-ஐ browser-ல் திறந்து, நீங்களே Admin password அமைக்கவும். அதன் பிறகு அந்த email/password-ஐ வைத்து login செய்யலாம். இந்த link-ஐ பிறருடன் பகிர வேண்டாம்.

Staff accounts-க்கு `.env`-ல் SMTP விவரங்கள் தேவை. Admin → Users & roles → Create user → Send setup email → staff password setup → Activate → Devices & sessions → Approve என்ற வரிசையில் செய்யவும்.

விரிவான Atlas, SMTP, hosting, testing விளக்கங்கள் `README.md`-ல் உள்ளன. Build மற்றும் 12 local tests pass. உங்கள் Atlas/SMTP இணைப்புடன் முழு end-to-end verification இன்னும் தேவை; அதற்கு முன் real staff pilot தயாராகிவிட்டது என்று கருத வேண்டாம்.
