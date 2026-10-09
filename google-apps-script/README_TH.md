# ติดตั้ง Arkham RPG Companion บน Google Apps Script

ใช้ชุดไฟล์ในโฟลเดอร์นี้ได้โดยตรง **ไม่ต้องติดตั้ง Node, npm หรือ clasp บน Mac** ตัวแอปจริงเปิดจาก URL ของ Google Apps Script หลัง Deploy ไฟล์ตัวอย่างออฟไลน์เป็นเพียงตัวอย่างหน้าตา

ชุดนี้มีระบบ Login/Campaign, สร้างและอนุมัตินักสืบ, Character Sheet/XP/อุปกรณ์, Session/Attendance/ประวัติ, เต๋าและทรัพยากร, เครื่องมือ GM/Clue/Handout, Rules Search, Gemini Assistant, Scanner/OCR/Translation และ Backup/Restore ดู [ขอบเขตและผลตรวจ](../docs/full-build-validation.md) ก่อนใช้งาน ข้อมูลกฎอ้างอิง Corebook ที่ผู้ใช้ส่งมา ความสามารถบางอย่างต้องให้ GM ตัดสินและบันทึกเหตุผลตามกฎ; แอปไม่ได้เล่นแทน GM

## 1. ดาวน์โหลดและคัดลอกโค้ด

1. เปิด [GitHub repository](https://github.com/chaiyatap20943-art/Arkham-Horror-RPG-Companion-/tree/main) → **Code → Download ZIP** แล้วแตก ZIP
2. เปิดโฟลเดอร์ `google-apps-script` → คลิกขวา `INSTALL.html` → **Open With → Safari** หรือ Chrome ไฟล์นี้มีโค้ดทั้งหมดพร้อมปุ่มคัดลอก เลือกชื่อไฟล์ แล้วคัดลอกลง editor ตามขั้นตอนถัดไป
3. เปิด [Google Apps Script](https://script.google.com/home/start) → **New project** ตั้งชื่อ `Arkham RPG Companion`
4. แทนเนื้อหาไฟล์ `Code.gs` เดิมด้วย `Code.gs` ทั้งหมดจากชุดนี้ ไม่ต้องสร้างไฟล์ server แยกอีก
5. กด **+ → HTML** สร้าง `Index`, `Styles`, `Client`, `Features` แล้ววางเนื้อหาจากไฟล์ชื่อเดียวกันในชุดนี้ ช่องตั้งชื่อ HTML ไม่ต้องพิมพ์ `.html`
6. **Project Settings → Show appsscript.json manifest file in editor** แล้วกลับ Editor → วาง `appsscript.json` ของชุดนี้แทน manifest เดิม
7. กด Save โครงสร้างต้องมี Script หนึ่งไฟล์, HTML สี่ไฟล์ และ manifest หนึ่งไฟล์ ห้ามวาง `INSTALL.html` หรือ `README_TH.md` เป็นไฟล์ของโปรเจกต์

ถ้าคัดลอกผ่านปุ่มไม่ได้ ให้กด **เลือกโค้ดทั้งหมด → ⌘C** แล้ววางด้วย **⌘V** ไม่จำเป็นต้องเปิด `.gs` ด้วยแอปของ Mac

## 2. สร้างฐานข้อมูลส่วนตัว

1. สร้าง Google Sheet ใหม่ชื่อ `Arkham RPG Database` ด้วยบัญชีที่จะเป็นเจ้าของ installation เก็บ Sheet เป็นส่วนตัว
2. คัดลอก Spreadsheet ID จาก URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
3. ใน Apps Script → **Services** ตรวจว่ามี **Google Sheets API v4** และ **Drive API v3** จาก manifest ถ้ายังไม่มี กด **+** เพิ่มบริการทั้งสอง
4. ถ้า Apps Script ใช้ standard Google Cloud project ให้เปิด Google Sheets API และ Google Drive API ใน Cloud Console ของ project นั้นด้วย

สมาชิกใช้งานผ่านตัวแอป ไม่ต้องแชร์ Sheet หรือโฟลเดอร์ Drive ให้ผู้เล่น แอปตรวจ membership และ role ที่เซิร์ฟเวอร์ทุก request

## 3. สร้าง Google OAuth สำหรับ Login

1. เปิด [Google Cloud Console](https://console.cloud.google.com/) สร้างหรือเลือก project
2. ไป **Google Auth Platform** ตั้ง Branding ชื่อแอป, support email และ developer contact
3. Audience เลือก **External** สำหรับบัญชี Google ส่วนบุคคล ขณะ Testing ให้เพิ่มบัญชีเจ้าของและเพื่อนที่จะทดสอบใน Test users
4. สร้าง **Clients → Create client → Web application** ไม่ใช่ Desktop application ตั้งชื่อ `Arkham Companion Web Login`
5. เก็บ **Client ID** และ **Client secret** ไว้กรอกใน Script Properties ตามข้อ 5 ไม่วาง secret ลง Code.gs, GitHub หรือแชต
6. Login ใช้ `openid`, verified email และ profile ส่วนสิทธิ์ Sheets/Drive ของ runtime เป็นสิทธิ์ที่เจ้าของ Apps Script อนุญาตแยกต่างหาก

## 4. Deploy Web app

1. Apps Script → **Deploy → New deployment → Select type → Web app**
2. **Execute as: Me** (บัญชีเจ้าของ installation)
3. **Who has access: Anyone** เพื่อให้ Google callback และสมาชิกเข้าถึงหน้าแอปได้ ตัวข้อมูลยังถูกป้องกันด้วย Google Login และ role ภายในแอป หากบัญชี Workspace ไม่มีตัวเลือกนี้ ต้องใช้ setting ที่องค์กรรองรับและทดสอบ callback จริง
4. กด Deploy และอนุญาตสิทธิ์เจ้าของเมื่อ Google ขอ
5. คัดลอก **Web app URL ที่ลงท้าย `/exec`** ไม่ใช้ `/dev` และไม่ใช้ Script ID แทน URL
6. กลับ Google OAuth Web client → **Authorized redirect URIs** → เพิ่ม URL `/exec` นี้แบบตรงทุกตัวอักษร → Save ไม่ต้องลงทะเบียน iframe URL ของ `googleusercontent.com`

## 5. ตั้ง Script Properties

Apps Script → **Project Settings → Script Properties → Add script property**:

| ชื่อ | ค่า |
| --- | --- |
| `DATABASE_ID` | Spreadsheet ID จากข้อ 2 |
| `GOOGLE_CLIENT_ID` | OAuth Client ID ชนิด Web application |
| `GOOGLE_CLIENT_SECRET` | Client secret ของ Web client |
| `APP_URL` | Web app URL `/exec` ที่ตรงกับ Authorized redirect URI |
| `GEMINI_API_KEY` | ใช้เฉพาะเมื่อต้องการ AI, OCR และแปลข้อความ รับ key จาก [Google AI Studio](https://aistudio.google.com/apikey) |
| `GEMINI_MODEL` | ไม่จำเป็น ค่าเริ่มต้น `gemini-2.5-flash`; เปลี่ยนเป็น model ที่บัญชีของคุณใช้งานได้ |

`PRIVATE_FOLDER_ID` จะถูกสร้างให้อัตโนมัติเมื่อรัน `initializePrivateStorage_` ไม่ต้องกรอกหรือแชร์โฟลเดอร์เอง ฟังก์ชันนี้สร้างโฟลเดอร์ private ของแอปด้วย scope `drive.file` ซึ่งจำกัดไฟล์ที่ app สร้าง/ได้รับสิทธิ์ ไม่ให้แอปอ่าน Drive ทั้งบัญชี

## 6. เริ่มระบบและตรวจ installation

กลับ Apps Script Editor เลือกฟังก์ชันจาก dropdown แล้วกด **Run** ตามลำดับ:

1. `initializeDatabase_` — สร้างตารางที่ขาดและเพิ่ม source catalog สำหรับ Campaign เดิม โดยไม่ลบข้อมูลหรือ tab อื่น
2. `initializePrivateStorage_` — สร้างโฟลเดอร์เก็บภาพส่วนตัว ต้องใช้ Drive API v3
3. `checkInstallation_` — อ่านการตั้งค่าและ header ของตาราง แสดง `ready: true` เมื่อส่วนฐานข้อมูล/Login พร้อมตั้งค่า ค่า secret ไม่แสดงในรายงาน

ฟังก์ชันที่ลงท้าย `_` ใช้จาก editor ของเจ้าของเท่านั้น ไม่ได้เปิดเป็น client RPC การตรวจ `ready` ไม่แทนการทดสอบ Google Login จริง

เปิด URL `/exec` → Continue with Google → ลงชื่อเข้าใช้ในหน้าต่างที่เปิด → กลับแท็บแอปเดิม หาก popup ถูกบล็อกใช้ลิงก์เปิด Login ในแอป หากยังไม่กลับอัตโนมัติ ให้นำ one-time ticket จากหน้า callback วางในช่องของแท็บเดิม ห้ามแชร์ ticket

## 7. ทดลองใช้งานจริง

1. บัญชี A สร้าง Campaign → เชิญ verified email ของบัญชี B → B Login และ Accept invitation
2. B สร้างนักสืบผ่าน Wizard ทั้ง 6 หน้า → Save → Submit → A ตรวจและ Approve รายการ Relic/Tome ต้องอนุมัติเฉพาะรายการ
3. A สร้าง Session → บันทึก Attendance เป็น PRESENT พร้อมนักสืบที่ APPROVED → Start → สร้าง/เลือก Scene → เปิด Sheet และ Roll
4. A สร้าง Clue แบบ GM-only ตรวจว่า B ไม่เห็น จากนั้น Reveal ให้ผู้เล่นที่เลือก แล้วทดสอบด้วยบัญชี C ว่าไม่เห็นโดยไม่มีสิทธิ์
5. End Session บันทึก Summary/XP → ตรวจ Snapshot → เริ่ม Session ถัดไป ข้อมูลตัวละครและ injuries คงอยู่ Snapshot เดิมต้องไม่เปลี่ยน
6. ทดสอบ Rules Search ไทย/อังกฤษ หากตั้ง Gemini ให้ทดสอบคำถามที่มี/ไม่มี source และการแปล/OCR หลังยืนยันข้อความหรือภาพที่จะส่งไปบริการ
7. ถอนสมาชิก B แล้วลอง request ด้วย session เดิม ต้องถูกปฏิเสธ ใช้ Browser profiles แยกเพื่อไม่สลับบัญชีโดยไม่ตั้งใจ

AI/OCR/Translation ไม่มี key หรือบริการล้มเหลวต้องแจ้งสถานะ ส่วน Campaign, Character, Session และการเล่นยังใช้ได้ ภาพ Scanner รองรับ JPEG/PNG/WebP ขนาดไม่เกิน **750 KiB**; PDF เต็มเล่มไม่ใช่ input ของ Scanner ให้ใช้ catalog/import ที่ผ่านการตรวจแทน

## 8. อัปเดตและสำรอง

ก่อนอัปเดตใช้ Tools → Export campaign (เฉพาะ Owner) และทำสำเนา Sheet ส่วนตัวผ่าน Google Sheets เก็บ backup เป็นส่วนตัว เพราะมีข้อมูล GM/สมาชิก Backup JSON ไม่รวมรูปภาพจริงบน Drive หรือ credentials

วาง Code/HTML/manifest รุ่นใหม่ → Save → Run `initializeDatabase_` เพื่อเพิ่มตารางที่ขาด → **Deploy → Manage deployments → Edit → Version: New version → Deploy** โดยใช้ deployment เดิม URL `/exec` จึงคงเดิม ถ้าสร้าง deployment ใหม่ต้องเปลี่ยน `APP_URL` และ OAuth redirect URI ตาม URL ใหม่

Restore ต้องเป็น backup ของ Campaign เดิม โดย Owner และมีเหตุผล ไม่ย้าย ownership/campaign, ไม่ลบ Campaign อื่น และไม่ย้อนเขียน snapshot เดิมแบบเงียบ ๆ ถ้า source/version ไม่เข้ากัน แอปปฏิเสธแทนการเดาค่า ไฟล์ Drive ต้องเก็บแยกและคงสิทธิ์ private

Restore เป็นการกู้/รวมข้อมูล: รักษาสิทธิ์สมาชิกและข้อจำกัดการเผยแพร่ปัจจุบัน รวมถึงรายการใหม่และประวัติที่เกิดหลัง backup ไม่ใช่การแทนฐานข้อมูลทั้งชุด ไม่รับ receipt ของ request ที่ไม่รู้จักจาก JSON; สมาชิกที่นำเข้าใหม่ต้องได้รับคำเชิญและตอบรับอีกครั้ง ไฟล์รูปใหม่ต้องอัปโหลดหรือผูกใหม่ผ่านระบบ หลัง Restore ให้ปิดแท็บเดิมและ Login ใหม่เพื่อใช้ request ID ใหม่

ถ้า upload ล้มเหลวระหว่าง Drive กับ Sheets ใช้ `cleanupOrphanFiles_` จาก editor เพื่อจัดการไฟล์ private ที่ค้างเกิน 24 ชั่วโมง ฟังก์ชันตรวจ records ที่ commit แล้วก่อนลบไฟล์ค้าง

## เมื่อพบปัญหา

| อาการ | ตรวจ |
| --- | --- |
| `redirect_uri_mismatch` | `/exec` ใน `APP_URL` และ Authorized redirect URI ต้องตรงกัน |
| เข้า Login ไม่ได้ขณะ Testing | บัญชีอยู่ใน OAuth Test users และ Web client ใช้ project ที่ถูกต้อง |
| `Sheets is not defined` หรือ `Drive is not defined` | Services v4/v3 และ Cloud API ตามข้อ 2 |
| Database unavailable | `DATABASE_ID`, สิทธิ์บัญชีเจ้าของ และ `initializeDatabase_` |
| Scanner/AI ใช้ไม่ได้ | `PRIVATE_FOLDER_ID`, `GEMINI_API_KEY`, model ที่รองรับ และ quota ของบัญชี |
| การแก้ไม่ปรากฏใน `/exec` | Deploy รุ่นใหม่ของ deployment เดิม; Save source อย่างเดียวไม่อัปเดต deployed version |
| Mac เปิด `.gs` ไม่ได้ | เปิด `INSTALL.html` ด้วย Safari แล้วคัดลอกโค้ด ไม่ต้องรัน `.gs` บน Mac |

Google consent, Apps Script iframe, Sheets/Drive/Gemini จริงและ quota ต้องตรวจบน deployment ของเจ้าของ ไม่มี credentials ของคุณในชุดนี้และยังไม่มีการ Deploy เข้าบัญชี Google ของคุณ
