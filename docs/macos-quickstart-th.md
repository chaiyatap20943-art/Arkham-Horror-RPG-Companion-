# เริ่มทดลองบน Mac

ถ้าแชตแสดง “ไม่สามารถโหลด Artifact นี้ได้” ขณะ Save As แสดงว่ายังดาวน์โหลดไฟล์ไม่สำเร็จ ยังไม่ใช่ข้อผิดพลาดของการรันแอปบน macOS. การเปลี่ยน Node หรือตั้งค่า Google ไม่ช่วยแก้ขั้นตอนดาวน์โหลดนี้

## ดูหน้าตาโดยไม่ต้องติดตั้ง

เมื่อ source ถูกส่งถึงคุณแล้ว หรือถูกนำขึ้น GitHub หลังได้รับคำสั่ง:

1. แตก ZIP ของโปรเจกต์
2. เปิดโฟลเดอร์ `preview`
3. คลิกขวาที่ `arkham-preview.html` → **Open With → Safari** หรือ **Google Chrome**

ไฟล์นี้เริ่มเป็นภาษาไทย ใช้ข้อมูลแคมเปญสมมติ และมีข้อความ “ออฟไลน์ · ข้อมูลตัวอย่าง · อ่านอย่างเดียว” ชัดเจน เปลี่ยนภาษาและเปิดรายละเอียดได้ แต่ login/สร้างแคมเปญ/บันทึกข้อมูลไม่ได้ ไม่ต้องใช้ Node, Terminal, Google project หรือ API key

ถ้ามี source อยู่ใน repository แล้ว สามารถกด **Code → Download ZIP** ใน GitHub เพื่อรับไฟล์ทั้งโปรเจกต์ได้ ไฟล์ preview อยู่ใน ZIP นั้น ไม่ต้องเปิด raw Apps Script `src/client/Index.html` ซึ่งยังมี server templates

## เปิด development server

1. ติดตั้ง Node.js 24 รุ่นที่รองรับ macOS ของคุณจากเว็บไซต์ Node.js หากติดตั้งไม่ได้ ให้ใช้ Codespaces แทน; ข้อกำหนด OS ของ Node เป็นคนละเรื่องกับ Artifact download
2. เปิด Terminal พิมพ์ `cd ` (เว้นวรรคท้าย) แล้วลากโฟลเดอร์โปรเจกต์จาก Finder มาวาง กด Enter. ต้องอยู่ในโฟลเดอร์ที่มี `package.json`
3. ตรวจและเริ่มแอป:

```bash
node -v
npm ci
npm run check
npm run dev
```

4. เปิด Safari/Chrome ไปที่ `http://localhost:3000` บน Mac ของคุณ และเปิด Terminal ค้างไว้ระหว่างทดลอง
5. หากยังไม่มี Google client ให้กด **Explore the interface** ซึ่งเป็นตัวอย่างอ่านอย่างเดียว

ถ้า `npm: command not found` ให้ติดตั้ง Node ก่อน. ถ้าแจ้งว่าไม่พบ `package.json` ให้กลับไปทำขั้นตอน `cd` ใหม่. ถ้าเบราว์เซอร์เชื่อมต่อพอร์ตไม่ได้ ให้ตรวจว่า `npm run dev` ยังรันอยู่ และดู error ใน Terminal

## ใช้ Google login และบันทึก Campaign จริง

ทำตาม `docs/setup.md`: สร้าง Apps Script + Sheet ส่วนตัว, เปิด Sheets API v4, สร้าง OAuth web client, Deploy แบบ owner execution, ลงทะเบียน URL `/exec` ให้ตรง และตั้ง Script Properties. ส่วนนี้ทำผ่านเบราว์เซอร์บน Mac ได้โดยไม่ใช้ Node หรือ clasp หากคัดลอกไฟล์ deployment ผ่าน Google editor

Client Secret ต้องกรอกใน Script Properties โดยตรง ไม่ส่งในแชตหรือใส่ลง Git. ยังไม่ต้องใช้ Gemini สำหรับ Foundation

## การตรวจสอบไฟล์ตัวอย่าง

ทดสอบ JavaScript และการ render/เปลี่ยนภาษา/นำทางใน Chromium โดยจำลองการปฏิเสธ storage แล้ว ไม่มี network request หรือปุ่ม mutation ที่เปิดใช้งาน. สภาพแวดล้อม cloud บล็อกการนำทาง `file://` ด้วยนโยบายเบราว์เซอร์ จึงใช้การโหลด HTML ลงหน้าเปล่าเพื่อทดสอบพฤติกรรมแทน. ยังไม่ได้ทดสอบ Safari บนเครื่อง Mac จริง
