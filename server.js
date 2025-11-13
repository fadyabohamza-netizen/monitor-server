const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// تفعيل CORS للسماح بطلبات من التطبيقات
app.use(cors());
app.use(express.json());

console.log('🚀 Starting Real-Time Monitor Server...');

// إعداد Socket.IO
const io = socketIo(server, {
  cors: {
    origin: "*", // السماح لجميع المصادر (لتطبيقات الأندرويد)
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// تخزين الأجهزة المتصلة
let connectedUsers = [];
let connectedAdmins = [];

// حدث الاتصال
io.on('connection', (socket) => {
  console.log('🔗 New client connected:', socket.id);

  // استقبال تسجيل جهاز مستخدم
  socket.on('register_device', (data) => {
    const userInfo = {
      socketId: socket.id,
      deviceId: data.deviceId,
      type: 'user',
      status: 'online',
      name: data.name || 'جهاز غير معروف',
      timestamp: new Date().toLocaleString('ar-SA')
    };
    
    // إضافة الجهاز للقائمة
    const existingIndex = connectedUsers.findIndex(user => user.deviceId === data.deviceId);
    if (existingIndex !== -1) {
      connectedUsers[existingIndex] = userInfo;
    } else {
      connectedUsers.push(userInfo);
    }
    
    console.log('📱 User registered:', data.deviceId);
    
    // تحديث قائمة الأجهزة لجميع الأدمن
    updateAdminDeviceList();
    
    // إرسال تأكيد للمستخدم
    socket.emit('registration_success', {
      message: 'تم تسجيل الجهاز بنجاح',
      deviceId: data.deviceId,
      totalDevices: connectedUsers.length
    });
  });

  // استقبال تسجيل أدمن
  socket.on('register_admin', (data) => {
    const adminInfo = {
      socketId: socket.id,
      adminId: data.adminId,
      type: 'admin',
      name: data.name || 'أدمن',
      timestamp: new Date().toLocaleString('ar-SA')
    };
    
    const existingIndex = connectedAdmins.findIndex(admin => admin.adminId === data.adminId);
    if (existingIndex !== -1) {
      connectedAdmins[existingIndex] = adminInfo;
    } else {
      connectedAdmins.push(adminInfo);
    }
    
    console.log('👤 Admin registered:', data.adminId);
    
    // إرسال قائمة الأجهزة الحالية للأدمن
    socket.emit('device_list', { 
      devices: connectedUsers,
      message: `مرحباً ${data.name || 'أدمن'}! ${connectedUsers.length} أجهزة متصلة`,
      totalDevices: connectedUsers.length,
      lastUpdate: new Date().toLocaleString('ar-SA')
    });
  });

  // استقبال أوامر من الأدمن
  socket.on('admin_command', (data) => {
    console.log('📨 Command from admin:', data.adminId, '->', data.command);
    
    // البحث عن الجهاز المستهدف
    const targetDevice = connectedUsers.find(device => 
      device.deviceId === data.targetDevice
    );
    
    if (targetDevice) {
      console.log('🎯 Sending command to:', targetDevice.deviceId);
      
      // إرسال الأمر للجهاز
      io.to(targetDevice.socketId).emit('admin_command', {
        command: data.command,
        adminId: data.adminId,
        targetDevice: data.targetDevice,
        timestamp: new Date().toLocaleString('ar-SA')
      });
      
      // تأكيد للأدمن
      socket.emit('command_sent', {
        success: true,
        command: data.command,
        targetDevice: data.targetDevice,
        message: 'تم إرسال الأمر بنجاح'
      });
      
    } else {
      console.log('❌ Target device not found:', data.targetDevice);
      socket.emit('command_sent', {
        success: false,
        command: data.command,
        targetDevice: data.targetDevice,
        message: 'الجهاز غير متصل'
      });
    }
  });

  // استقبال ردود من الأجهزة
  socket.on('command_response', (data) => {
    console.log('📩 Response from device:', data.fromDevice);
    
    // إرسال الرد للأدمن المرسل
    const targetAdmin = connectedAdmins.find(admin => 
      admin.adminId === data.adminId
    );
    
    if (targetAdmin) {
      io.to(targetAdmin.socketId).emit('command_response', {
        ...data,
        serverTime: new Date().toLocaleString('ar-SA')
      });
    }
  });

  // حدث انقطاع الاتصال
  socket.on('disconnect', (reason) => {
    console.log('🔌 Client disconnected:', socket.id, 'Reason:', reason);
    
    // إزالة من القوائم
    connectedUsers = connectedUsers.filter(user => user.socketId !== socket.id);
    connectedAdmins = connectedAdmins.filter(admin => admin.socketId !== socket.id);
    
    // تحديث القوائم
    updateAdminDeviceList();
  });

  // حدث خطأ
  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });
});

// دالة تحديث قائمة الأجهزة للأدمن
function updateAdminDeviceList() {
  const deviceList = {
    devices: connectedUsers,
    totalDevices: connectedUsers.length,
    connectedAdmins: connectedAdmins.length,
    lastUpdate: new Date().toLocaleString('ar-SA')
  };
  
  connectedAdmins.forEach(admin => {
    io.to(admin.socketId).emit('device_list', deviceList);
  });
  
  console.log('📊 Device list updated:', connectedUsers.length, 'devices,', connectedAdmins.length, 'admins');
}

// إرسال ping دوري للحفاظ على الاتصال نشط
setInterval(() => {
  if (connectedUsers.length > 0 || connectedAdmins.length > 0) {
    io.emit('ping', { 
      message: 'server_keep_alive',
      timestamp: new Date().toLocaleString('ar-SA')
    });
  }
}, 30000); // كل 30 ثانية

// صفحة الترحيب
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html dir="rtl">
      <head>
        <title>🚀 خادم المراقبة</title>
        <meta charset="UTF-8">
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; 
            padding: 40px; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-align: center;
          }
          .container { 
            max-width: 800px; 
            margin: 0 auto; 
            background: rgba(255,255,255,0.1); 
            padding: 30px; 
            border-radius: 20px; 
            backdrop-filter: blur(10px);
          }
          .status-card { 
            background: rgba(255,255,255,0.2); 
            padding: 20px; 
            border-radius: 15px; 
            margin: 15px 0; 
            text-align: right;
          }
          h1 { font-size: 2.5em; margin-bottom: 10px; }
          h3 { margin-top: 0; color: #ffd700; }
          .stat { font-size: 1.2em; margin: 10px 0; }
          .online { color: #4CAF50; font-weight: bold; }
          .offline { color: #f44336; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🚀 خادم المراقبة يعمل!</h1>
          <div class="status-card">
            <h3>📊 حالة الخادم:</h3>
            <div class="stat">✅ الأجهزة المتصلة: <span class="online">${connectedUsers.length}</span></div>
            <div class="stat">✅ الأدمن المتصلون: <span class="online">${connectedAdmins.length}</span></div>
            <div class="stat">🕒 آخر تحديث: ${new Date().toLocaleString('ar-SA')}</div>
            <div class="stat">🔧 حالة الخادم: <span class="online">نشط ومستقر</span></div>
          </div>
          <div class="status-card">
            <h3>📱 الأجهزة المتصلة:</h3>
            ${connectedUsers.map(device => `
              <div class="stat">📱 ${device.deviceId} - ${device.name} (${device.timestamp})</div>
            `).join('')}
            ${connectedUsers.length === 0 ? '<div class="stat">لا توجد أجهزة متصلة</div>' : ''}
          </div>
        </div>
      </body>
    </html>
  `);
});

// صفحة لحفظ السيرفر نشط
app.get('/keep-alive', (req, res) => {
  res.json({
    status: 'active',
    users: connectedUsers.length,
    admins: connectedAdmins.length,
    uptime: process.uptime(),
    timestamp: new Date().toLocaleString('ar-SA'),
    message: 'الخادم يعمل بشكل طبيعي'
  });
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Open: https://your-render-server.onrender.com`);
  console.log(`📱 Connected devices: ${connectedUsers.length}`);
  console.log(`👤 Connected admins: ${connectedAdmins.length}`);
});