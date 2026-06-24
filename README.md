# PRSC TLE Tracker

Live TLE fetcher for Pakistan's PRSC EO satellite constellation.  
Fetches from Celestrak → falls back to n2yo.

## Satellites
| Name     | NORAD ID |
|----------|----------|
| PRSC-EO1 | 62726    |
| PRSC-EO2 | 67748    |
| PRSC-EO3 | 68835    |
| PRSC-S1  | 65055    |
| HS       | 66054    |
| PRSS-1   | 43530    |

## Deploy to Vercel (3 steps)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "initial commit"
gh repo create tle-tracker --public --push
```

### 2. Import on Vercel
- Go to https://vercel.com/new
- Import your GitHub repo
- Framework: Next.js (auto-detected)
- Click Deploy — done

### 3. Share the URL
Vercel gives you a public URL like `https://tle-tracker.vercel.app`  
Anyone can open it on mobile or desktop.

## Run locally
```bash
npm install
npm run dev
# open http://localhost:3000
```

## Notes
- TLE is cached in-memory for 6 hours per serverless instance
- For persistent cache across instances, replace cache object in `pages/api/tle.js` with Vercel KV
- Celestrak is tried first; n2yo is fallback

## Important Links:
- [Celestrak Norad - 68835](https://celestrak.org/NORAD/elements/gp.php?CATNR=68835&FORMAT=TLE)
- [Celestrak Satcat Search](https://celestrak.org/satcat/search.php)
- [n2yo - 68835](https://www.n2yo.com/satellite/?s=68835)
- [celestrak TLE] (https://celestrak.org/norad/elements/table.php?GROUP=resource&FORMAT=tle)
- [celestrak - collision](https://celestrak.org/SOCRATES/)
- [celestrak - collision](https://celestrak.org/SOCRATES/table-socrates.php?CATNR=68835&ORDER=MINRANGE&MAX=10)
- [celestrak - collision](https://celestrak.org/SOCRATES/table-socrates.php?CATNR=62726,&ORDER=TCA&MAX=25)
- [celestrak - collision](https://celestrak.org/publications/AAS/05-124/)
- [celestrak - collision](https://celestrak.org/SOCRATES/socrates-format.php)
- [datatracker - collision](https://datatracker.ietf.org/accounts/login/?next=/)
