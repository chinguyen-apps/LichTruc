import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Users, BookOpen, Settings, LogIn, LogOut, 
  Plus, Save, Edit, Trash2, Search, AlertCircle, Loader,
  ChevronLeft, ChevronRight, CalendarDays, Columns, Menu, X,
  Star, Clock
} from 'lucide-react';

// --- THEME COLORS ---
const HEADER_COLOR = '#006D5B';
const BG_BODY = '#f4f6f8';
const BG_CONTAINER = '#ffffff';

const APP_FEATURES = [
  { id: 'EDIT_SCHEDULE', name: 'Cập nhật lịch trực' },
  { id: 'MANAGE_EMPLOYEES', name: 'Quản lý cán bộ' },
  { id: 'MANAGE_ABBRS', name: 'Quản lý từ viết tắt' },
  { id: 'SYSTEM_ADMIN', name: 'Quản trị hệ thống' }
];

// --- HELPER: SHA256 Hashing ---
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  // Sử dụng đúng chuẩn SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Chuyển sang chuỗi hex chữ thường
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// --- HELPER FUNCTIONS FOR DATES & SHIFTS ---
const getDaysInMonth = (month, year) => {
  const date = new Date(year, month - 1, 1);
  const days = [];
  while (date.getMonth() === month - 1) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

const formatDate = (date) => {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${y}-${m}-${d}`;
};

const formatDisplayDate = (date) => {
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};

const getWeekDays = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
  const monday = new Date(d.setDate(diff));
  const week = [];
  for (let i = 0; i < 7; i++) {
    const nextDay = new Date(monday);
    nextDay.setDate(monday.getDate() + i);
    week.push(nextDay);
  }
  return week;
};

const getMonthCalendarDays = (month, year) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days = [];
  
  let startPadding = firstDay.getDay() - 1;
  if (startPadding === -1) startPadding = 6;
  
  for (let i = startPadding; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    days.push({ date: d, isCurrentMonth: false });
  }
  
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), isCurrentMonth: true });
  }
  
  const remainder = days.length % 7;
  const endPadding = remainder === 0 ? 0 : 7 - remainder;
  for (let i = 1; i <= endPadding; i++) {
    const d = new Date(year, month + 1, i);
    days.push({ date: d, isCurrentMonth: false });
  }
  
  return days;
};

const getShiftTime = (code) => {
  if (!code) return { start: 8, end: 17 };
  const codeUpper = String(code).toUpperCase();
  if (codeUpper.includes('CN') || codeUpper.includes('CNM')) return { start: 18, end: 30 }; 
  if (codeUpper.includes('HT')) return { start: 6, end: 18 }; 
  if (codeUpper.includes('NL')) return { start: 6, end: 18 };
  if (codeUpper.includes('CT')) return { start: 8, end: 18 };
  if (codeUpper.includes('B1/2')) return { start: 8, end: 13 }; 
  if (codeUpper.includes('C1/2')) return { start: 13, end: 18 }; 
  if (codeUpper.includes('QT1')) return { start: 8, end: 16 };
  if (codeUpper.includes('QT2')) return { start: 16, end: 23.9 }; 
  if (codeUpper.includes('NB')) return { start: 8, end: 18 };
  return { start: 8, end: 17 }; 
};

export default function App() {
  const [currentView, setCurrentView] = useState('VIEW_SCHEDULE');
  const [currentUser, setCurrentUser] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem('appConfig');
    const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxg2bdC9vlQt1bE1vYwRZtADVekOX-eHZolnvW51NGgGJUa6lyRs0HDm1hp_HS3Dfea/exec';
    
    if (saved) {
      const parsedConfig = JSON.parse(saved);
      if (!parsedConfig.apiWebAppUrl) {
        parsedConfig.apiWebAppUrl = DEFAULT_API_URL;
      }
      return parsedConfig;
    }
    
    return { 
      apiWebAppUrl: DEFAULT_API_URL, 
      mapping: { schedule: 'Sheet1', abbreviations: 'Sheet2', users: 'Sheet3' } 
    };
  });
  
  const [employees, setEmployees] = useState([]);
  const [abbreviations, setAbbreviations] = useState([]);
  const [scheduleData, setScheduleData] = useState({});
  const [appUsers, setAppUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [alertData, setAlertData] = useState({ show: false, message: '', type: 'info' });
  const [confirmData, setConfirmData] = useState({ show: false, message: '', onConfirm: null });

  const showAlert = (message, type = 'info') => {
    setAlertData({ show: true, message, type });
    setTimeout(() => setAlertData(prev => ({ ...prev, show: false })), 3000);
  };

  const showConfirm = (message, onConfirm) => {
    setConfirmData({
      show: true,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmData({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const closeConfirm = () => setConfirmData({ show: false, message: '', onConfirm: null });

  useEffect(() => {
    localStorage.setItem('appConfig', JSON.stringify(config));
  }, [config]);

  const fetchAllData = async () => {
    if (!config.apiWebAppUrl || !config.mapping.users) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${config.apiWebAppUrl}?action=getAllData&mapping=${encodeURIComponent(JSON.stringify(config.mapping))}`);
      const data = await res.json();
      
      if (data.success) {
        setAppUsers(data.data.users || []);
        setAbbreviations(data.data.abbreviations || []);
        
        const rawHeaders = data.data.rawSchedule?.headers || [];
        const rawRows = data.data.rawSchedule?.rows || [];
        
        const newEmployees = [];
        const newScheduleData = {};

        rawRows.forEach((row, rIdx) => {
          const empId = rIdx + 1; 
          newEmployees.push({ id: empId, name: row[0], email: row[1], rowIndex: rIdx + 2 });
          
          for (let cIdx = 2; cIdx < rawHeaders.length; cIdx++) {
            const dateHeader = rawHeaders[cIdx];
            const val = row[cIdx];
            if (val && dateHeader) {
              const parts = dateHeader.split('/');
              if (parts.length >= 3) {
                const month = parseInt(parts[0], 10); 
                const day = parseInt(parts[1], 10);   
                const year = parseInt(parts[2], 10);
                
                const monthKey = `${month}_${year}`;
                const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                
                if (!newScheduleData[monthKey]) newScheduleData[monthKey] = {};
                if (!newScheduleData[monthKey][empId]) newScheduleData[monthKey][empId] = {};
                
                newScheduleData[monthKey][empId][dateStr] = val;
              }
            }
          }
        });
        
        setEmployees(newEmployees);
        setScheduleData(newScheduleData);
      } else {
        console.error("Lỗi API từ Google Sheet:", data.error);
      }
    } catch (error) {
      console.error("Lỗi kết nối khi tải dữ liệu:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [config.apiWebAppUrl]);

  const handleLogin = async (username, password) => {
    try {
      const userRecord = appUsers.find(u => u.User === username);
      
      if (username === 'admin') {
        const hasNoPasswordInSheet = !userRecord || !userRecord.Password || userRecord.Password.trim() === '';
        // Mật khẩu dự phòng nếu trong Sheet cột Password bị trống
        if (hasNoPasswordInSheet && password === 'cbs@123') {
          setCurrentUser({ 
            username: 'admin', 
            name: 'Quản trị viên',
            permissions: APP_FEATURES.map(f => f.id)
          });
          return true;
        }
      }

      if (userRecord && userRecord.Password) {
        const hashedPassword = await sha256(password);
        // CẬP NHẬT: So sánh không phân biệt hoa thường và bỏ khoảng trắng dư thừa từ Sheet
        const storedHash = String(userRecord.Password).trim().toLowerCase();
        if (storedHash === hashedPassword) {
          const userPerms = userRecord.Permissions ? userRecord.Permissions.split(',') : [];
          setCurrentUser({
            username: userRecord.User,
            name: userRecord.User,
            permissions: username === 'admin' ? APP_FEATURES.map(f => f.id) : userPerms
          });
          return true;
        }
      }

      return false;
    } catch (e) {
      console.error("Lỗi xác thực:", e);
      return false;
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('VIEW_SCHEDULE');
    setIsMobileMenuOpen(false);
  };

  const handleNavClick = (view) => {
    setCurrentView(view);
    setIsMobileMenuOpen(false); 
  };

  const renderMainContent = () => {
    if (isLoading) {
      return <div className="flex-1 flex items-center justify-center"><Loader className="animate-spin" style={{ color: HEADER_COLOR }} size={48} /></div>;
    }

    switch (currentView) {
      case 'VIEW_SCHEDULE':
        return <ViewSchedule employees={employees} scheduleData={scheduleData} abbreviations={abbreviations} />;
      case 'EDIT_SCHEDULE':
        if (currentUser?.permissions?.includes('EDIT_SCHEDULE')) {
          return <EditSchedule employees={employees} scheduleData={scheduleData} setScheduleData={setScheduleData} abbreviations={abbreviations} config={config} refreshData={fetchAllData} showAlert={showAlert} />;
        }
        return <AccessDenied />;
      case 'MANAGE_EMPLOYEES':
        if (currentUser?.permissions?.includes('MANAGE_EMPLOYEES')) {
          return <ManageEmployees employees={employees} config={config} refreshData={fetchAllData} showAlert={showAlert} showConfirm={showConfirm} />;
        }
        return <AccessDenied />;
      case 'MANAGE_ABBRS':
        if (currentUser?.permissions?.includes('MANAGE_ABBRS')) {
          return <ManageAbbreviations abbreviations={abbreviations} config={config} refreshData={fetchAllData} showAlert={showAlert} showConfirm={showConfirm} />;
        }
        return <AccessDenied />;
      case 'SYSTEM_ADMIN':
        if (currentUser?.permissions?.includes('SYSTEM_ADMIN')) {
          return <SystemAdmin config={config} setConfig={setConfig} appUsers={appUsers} setAppUsers={setAppUsers} showAlert={showAlert} showConfirm={showConfirm} />;
        }
        return <AccessDenied />;
      default:
        return <ViewSchedule employees={employees} scheduleData={scheduleData} abbreviations={abbreviations} />;
    }
  };

  return (
    <div className="flex h-screen font-sans text-sm" style={{ backgroundColor: BG_BODY }}>
      {alertData.show && (
        <div className={`fixed top-5 right-5 z-[100] px-6 py-3 rounded-lg shadow-xl text-white font-bold transition-all transform duration-300 ${alertData.type === 'error' ? 'bg-red-500' : 'bg-[#006D5B]'}`}>
          {alertData.message}
        </div>
      )}

      {confirmData.show && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
            <h3 className="font-bold text-lg mb-2" style={{ color: HEADER_COLOR }}>Xác nhận</h3>
            <p className="text-gray-700 mb-6 whitespace-pre-wrap leading-relaxed">{confirmData.message}</p>
            <div className="flex justify-end gap-3">
               <button onClick={closeConfirm} className="px-4 py-2 bg-gray-200 text-gray-800 rounded font-bold hover:bg-gray-300 transition-colors">Hủy</button>
               <button onClick={confirmData.onConfirm} className="px-4 py-2 bg-red-600 text-white rounded font-bold hover:bg-red-700 transition-colors">Đồng ý</button>
            </div>
          </div>
        </div>
      )}

      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <div className={`fixed inset-y-0 left-0 transform ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"} lg:relative lg:translate-x-0 transition duration-300 ease-in-out z-40 w-64 text-white flex flex-col shadow-2xl lg:shadow-lg`} style={{ backgroundColor: HEADER_COLOR }}>
        <div className="p-4 font-bold text-lg flex items-center justify-between border-b border-white/10" style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}>
          <div className="flex items-center gap-2">
            <Calendar className="text-emerald-300" />
            <span>Lịch Trực BIDV</span>
          </div>
          <button className="lg:hidden p-1 hover:bg-white/10 rounded-lg" onClick={() => setIsMobileMenuOpen(false)}>
            <X size={20} />
          </button>
        </div>
        
        <nav className="flex-1 py-4 overflow-y-auto">
          <NavItem icon={<Calendar />} label="Xem Lịch Trực" active={currentView === 'VIEW_SCHEDULE'} onClick={() => handleNavClick('VIEW_SCHEDULE')} />
          
          {currentUser?.permissions?.includes('EDIT_SCHEDULE') && (
            <NavItem icon={<Edit />} label="Cập Nhật Lịch" active={currentView === 'EDIT_SCHEDULE'} onClick={() => handleNavClick('EDIT_SCHEDULE')} />
          )}
          
          {(currentUser?.permissions?.includes('MANAGE_EMPLOYEES') || currentUser?.permissions?.includes('MANAGE_ABBRS') || currentUser?.permissions?.includes('SYSTEM_ADMIN')) && (
            <div className="px-4 py-2 mt-4 text-xs font-semibold text-emerald-200/50 uppercase tracking-wider">Quản lý</div>
          )}
          {currentUser?.permissions?.includes('MANAGE_EMPLOYEES') && (
            <NavItem icon={<Users />} label="Cán Bộ Trực" active={currentView === 'MANAGE_EMPLOYEES'} onClick={() => handleNavClick('MANAGE_EMPLOYEES')} />
          )}
          {currentUser?.permissions?.includes('MANAGE_ABBRS') && (
            <NavItem icon={<BookOpen />} label="Từ Viết Tắt" active={currentView === 'MANAGE_ABBRS'} onClick={() => handleNavClick('MANAGE_ABBRS')} />
          )}
          {currentUser?.permissions?.includes('SYSTEM_ADMIN') && (
            <NavItem icon={<Settings />} label="Hệ Thống & Phân Quyền" active={currentView === 'SYSTEM_ADMIN'} onClick={() => handleNavClick('SYSTEM_ADMIN')} />
          )}
        </nav>

        <div className="p-4 border-t border-white/10" style={{ backgroundColor: 'rgba(0,0,0,0.1)' }}>
          {currentUser ? (
            <div className="flex items-center justify-between">
              <div className="flex flex-col overflow-hidden pr-2">
                <span className="font-semibold text-sm truncate">{currentUser.name}</span>
                <span className="text-xs text-emerald-200" title="Đã đăng nhập">Hoạt động</span>
              </div>
              <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded transition-colors shrink-0" title="Đăng xuất">
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <LoginModal onLogin={handleLogin} />
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative">
        <div className="lg:hidden flex items-center p-4 text-white shadow-md shrink-0 z-20" style={{ backgroundColor: HEADER_COLOR }}>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-1 mr-3 hover:bg-white/10 rounded-lg transition-colors">
            <Menu size={24} />
          </button>
          <span className="font-bold text-lg">Lịch Trực BIDV</span>
        </div>

        {(!config.apiWebAppUrl && currentView !== 'SYSTEM_ADMIN') && (
          <div className="w-full p-2 bg-yellow-100 text-yellow-800 text-center text-xs sm:text-sm font-bold shadow-sm z-10 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
            <AlertCircle size={16} className="shrink-0" /> 
            <span>Chưa kết nối Google Sheet. Đăng nhập admin (mật khẩu: cbs@123) để cấu hình.</span>
          </div>
        )}

        <div className="flex-1 overflow-auto flex flex-col relative bg-transparent">
          {renderMainContent()}
        </div>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <div 
      onClick={onClick}
      className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors ${
        active ? 'bg-white/20 text-white border-l-4 border-emerald-300' : 'text-emerald-50 hover:bg-white/10 border-l-4 border-transparent'
      }`}
    >
      {React.cloneElement(icon, { size: 18 })}
      <span className="truncate">{label}</span>
    </div>
  );
}

// ==========================================
// COMPONENT: VIEW SCHEDULE (TUẦN & THÁNG & NGÀY)
// ==========================================
const EMP_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-600' },
  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-600' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-800', badge: 'bg-rose-600' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', badge: 'bg-amber-600' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-600' },
  { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800', badge: 'bg-indigo-600' },
  { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-800', badge: 'bg-pink-600' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-800', badge: 'bg-cyan-600' },
];

const getEmpColor = (empId) => EMP_COLORS[((empId || 1) - 1) % EMP_COLORS.length];

function ViewSchedule({ employees, scheduleData, abbreviations }) {
  const [viewMode, setViewMode] = useState('week'); 
  const [baseDate, setBaseDate] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');

  const getFormattedDateString = (date) => {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  };

  const dailyDuties = useMemo(() => {
    const duties = {};
    const filteredEmps = employees.filter(e => 
      e.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      e.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    Object.keys(scheduleData).forEach(monthKey => {
      Object.keys(scheduleData[monthKey]).forEach(empId => {
        const emp = filteredEmps.find(e => e.id == empId);
        if (!emp) return;
        
        Object.entries(scheduleData[monthKey][empId]).forEach(([dateStr, codeStr]) => {
          if (codeStr) {
            if (!duties[dateStr]) duties[dateStr] = [];
            const codes = String(codeStr).split(',').map(c => c.trim()).filter(Boolean);
            codes.forEach(code => {
               const abbr = abbreviations.find(a => a.code === code);
               duties[dateStr].push({ emp, code, meaning: abbr ? abbr.meaning : code });
            });
          }
        });
      });
    });
    return duties;
  }, [scheduleData, employees, abbreviations, searchTerm]);

  const handlePrev = () => {
    const d = new Date(baseDate);
    if (viewMode === 'day') d.setDate(d.getDate() - 1);
    else if (viewMode === 'week') d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    setBaseDate(d);
  };

  const handleNext = () => {
    const d = new Date(baseDate);
    if (viewMode === 'day') d.setDate(d.getDate() + 1);
    else if (viewMode === 'week') d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    setBaseDate(d);
  };

  const handleToday = () => {
    const today = new Date();
    setBaseDate(today);
    if (viewMode === 'week') {
       setTimeout(() => {
         const dateStr = getFormattedDateString(today);
         const el = document.getElementById('day-card-' + dateStr);
         if (el) {
           el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
         }
       }, 100);
    }
  };

  const handleDayClick = (date) => {
    setBaseDate(date);
    setViewMode('day');
  };

  const weekDays = getWeekDays(baseDate);
  const monthDays = getMonthCalendarDays(baseDate.getMonth(), baseDate.getFullYear());
  
  const START_HOUR = 5;
  const END_HOUR = 24;
  const TOTAL_HOURS = END_HOUR - START_HOUR;
  const timelineHours = Array.from({length: TOTAL_HOURS + 1}, (_, i) => i + START_HOUR); 

  const headerTitle = viewMode === 'week' 
    ? `Tuần: ${weekDays[0].getDate()}/${weekDays[0].getMonth()+1} - ${weekDays[6].getDate()}/${weekDays[6].getMonth()+1}`
    : viewMode === 'month' 
      ? `Tháng ${baseDate.getMonth()+1}, ${baseDate.getFullYear()}`
      : `Ngày ${baseDate.getDate()}/${baseDate.getMonth()+1}/${baseDate.getFullYear()}`;

  const dayNames = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];

  const selectedDateStr = getFormattedDateString(baseDate);
  const dayDutiesRaw = dailyDuties[selectedDateStr] || [];
  const dayDutiesByEmp = useMemo(() => {
     const map = {};
     dayDutiesRaw.forEach(duty => {
        if (!map[duty.emp.id]) map[duty.emp.id] = { emp: duty.emp, shifts: [] };
        map[duty.emp.id].shifts.push(duty);
     });
     return Object.values(map);
  }, [dayDutiesRaw]);

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4 sm:mb-6 mt-2 sm:mt-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800 shrink-0" style={{ color: HEADER_COLOR }}>Xem Lịch Trực</h1>
          
          <div className="flex items-center bg-white rounded-lg border shadow-sm overflow-hidden shrink-0">
             <button onClick={() => setViewMode('day')} className={`px-4 py-2 flex items-center gap-2 text-sm font-semibold transition-colors ${viewMode === 'day' ? 'bg-[#006D5B] text-white' : 'text-gray-600 hover:bg-gray-50 border-r'}`}>
                <Clock size={16} /> Ngày
             </button>
             <button onClick={() => setViewMode('week')} className={`px-4 py-2 flex items-center gap-2 text-sm font-semibold transition-colors ${viewMode === 'week' ? 'bg-[#006D5B] text-white' : 'text-gray-600 hover:bg-gray-50 border-r'}`}>
                <Columns size={16} /> Tuần
             </button>
             <button onClick={() => setViewMode('month')} className={`px-4 py-2 flex items-center gap-2 text-sm font-semibold transition-colors ${viewMode === 'month' ? 'bg-[#006D5B] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                <CalendarDays size={16} /> Tháng
             </button>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Tìm cán bộ..." 
              className="pl-9 pr-4 py-2 w-full border rounded-lg focus:outline-none focus:ring-2 shadow-sm"
              style={{ backgroundColor: BG_CONTAINER, outlineColor: HEADER_COLOR }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto gap-2">
            <div className="flex items-center bg-white rounded-lg border shadow-sm flex-1 sm:flex-none">
              <button onClick={handlePrev} className="p-2 sm:p-2.5 hover:bg-gray-50 text-gray-600 border-r"><ChevronLeft size={18} /></button>
              <div className="px-2 sm:px-4 font-bold text-gray-800 min-w-[140px] sm:min-w-[180px] text-center text-sm sm:text-base truncate" style={{ color: HEADER_COLOR }}>
                 {headerTitle}
              </div>
              <button onClick={handleNext} className="p-2 sm:p-2.5 hover:bg-gray-50 text-gray-600 border-l"><ChevronRight size={18} /></button>
            </div>
            <button onClick={handleToday} className="px-3 sm:px-4 py-2 sm:py-2.5 bg-white border rounded-lg shadow-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors shrink-0 text-sm sm:text-base">Hôm nay</button>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {viewMode === 'day' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
             <div className="flex-1 overflow-auto custom-scrollbar relative">
                <div className="min-w-[800px] flex flex-col min-h-full">
                   <div className="flex border-b bg-gray-50 sticky top-0 z-30 shadow-sm">
                      <div className="w-36 sm:w-44 md:w-52 p-2 font-bold text-gray-600 text-[11px] sm:text-sm border-r flex items-center justify-center shrink-0 bg-gray-50 sticky left-0 z-40 shadow-[1px_0_0_0_#e5e7eb]">
                         Cán bộ
                      </div>
                      <div className="flex-1 flex">
                         {timelineHours.slice(0, TOTAL_HOURS).map(h => (
                           <div key={h} className="flex-1 border-r border-gray-200/50 flex flex-col items-center justify-center py-1.5">
                             <span className="text-[8px] sm:text-[10px] text-gray-500 font-medium">{h.toString().padStart(2, '0')}:00</span>
                           </div>
                         ))}
                      </div>
                   </div>
                   
                   <div className="flex flex-col pb-4 flex-1">
                      {dayDutiesByEmp.length > 0 ? dayDutiesByEmp.map((item) => {
                         const empColor = getEmpColor(item.emp.id);
                         return (
                           <div key={item.emp.id} className="flex border-b border-gray-100 hover:bg-gray-50 transition-colors group relative">
                              <div className="w-36 sm:w-44 md:w-52 p-2 border-r flex items-center shrink-0 bg-white group-hover:bg-gray-50 z-20 sticky left-0 shadow-[1px_0_0_0_#f3f4f6]">
                                 <div className="font-medium text-[11px] sm:text-sm text-gray-800 leading-tight break-words max-h-12 overflow-hidden" title={item.emp.name}>
                                    {item.emp.name}
                                 </div>
                              </div>
                              <div className="flex-1 relative h-10 sm:h-14">
                                 <div className="absolute inset-0 flex pointer-events-none">
                                    {timelineHours.slice(0, TOTAL_HOURS).map(h => (
                                      <div key={h} className="flex-1 border-r border-dashed border-gray-100"></div>
                                    ))}
                                 </div>
                                 {item.shifts.map((shift, sIdx) => {
                                    const time = getShiftTime(shift.code);
                                    const visualStart = Math.max(time.start, START_HOUR);
                                    const visualEnd = Math.min(time.end, END_HOUR); 
                                    if (visualEnd <= visualStart) return null; 

                                    const left = `${((visualStart - START_HOUR) / TOTAL_HOURS) * 100}%`;
                                    const width = `${((visualEnd - visualStart) / TOTAL_HOURS) * 100}%`;
                                    
                                    let endTimeDisplay = "";
                                    if ((shift.code === 'CN' || shift.code === 'CNM') && time.start === 18) {
                                       endTimeDisplay = "18h - 6h sáng hôm sau";
                                    } else {
                                       const rawEnd = time.end > 24 ? `${Math.floor(time.end) - 24}h sáng hôm sau` : `${Math.floor(time.end)}h`;
                                       endTimeDisplay = `${Math.floor(time.start)}h - ${rawEnd}`;
                                    }
                                    
                                    return (
                                      <div
                                         key={sIdx}
                                         className={`absolute top-1 bottom-1 sm:top-1.5 sm:bottom-1.5 rounded ${empColor.bg} border ${empColor.border} shadow-sm flex items-center px-1 sm:px-2 overflow-hidden cursor-pointer hover:opacity-90 transition-all hover:scale-y-105 z-10`}
                                         style={{ left, width }}
                                         title={`${shift.code}: ${shift.meaning} (${endTimeDisplay})`}
                                      >
                                         <span className={`font-bold text-white text-[8px] sm:text-[10px] ${empColor.badge} px-1 rounded mr-1 sm:mr-1.5 shrink-0 leading-tight`}>{shift.code}</span>
                                         <span className={`truncate text-[8px] sm:text-[10px] leading-tight ${empColor.text}`}>{shift.meaning}</span>
                                      </div>
                                    )
                                 })}
                              </div>
                           </div>
                         );
                      }) : (
                        <div className="p-8 text-center text-gray-400 text-sm italic w-full absolute left-0 right-0">Không có cán bộ nào được phân lịch trực trong ngày này.</div>
                      )}
                   </div>
                </div>
             </div>
          </div>
        )}

        {viewMode === 'week' && (
          <div className="flex gap-4 overflow-x-auto pb-4 h-full snap-x">
            {weekDays.map((date, index) => {
               const dateStr = getFormattedDateString(date);
               const dayDuties = dailyDuties[dateStr] || [];
               const isToday = getFormattedDateString(new Date()) === dateStr;
               const isWeekend = date.getDay() === 0 || date.getDay() === 6;

               return (
                 <div key={dateStr} id={`day-card-${dateStr}`} className={`flex-1 min-w-[160px] sm:min-w-[180px] ${isWeekend ? 'bg-orange-50/30' : 'bg-white'} rounded-lg shadow-sm border ${isWeekend ? 'border-orange-200' : 'border-gray-200'} flex flex-col overflow-hidden snap-center`}>
                    <div 
                       className={`p-2 sm:p-3 text-center border-b cursor-pointer hover:opacity-80 transition-opacity ${isToday ? 'bg-[#006D5B] text-white border-[#006D5B]' : (isWeekend ? 'bg-orange-100/50 text-orange-800 border-orange-200' : 'bg-gray-50 text-gray-700 border-gray-200')}`}
                       onClick={() => handleDayClick(date)}
                    >
                       <div className="uppercase font-bold text-[10px] sm:text-xs tracking-wider mb-0.5">{dayNames[index]}</div>
                       <div className={`text-base font-bold sm:text-lg flex items-center justify-center gap-1 ${isToday ? 'text-white' : (isWeekend ? 'text-orange-700' : 'text-gray-900')}`}>
                         {date.getDate()}/{date.getMonth()+1}
                         {isToday && <Star size={14} className="fill-yellow-400 text-yellow-400 drop-shadow-sm mb-0.5" />}
                       </div>
                    </div>
                    <div className="p-2 sm:p-3 space-y-2.5 sm:space-y-3 flex-1 overflow-y-auto">
                       {dayDuties.length > 0 ? dayDuties.map((duty, idx) => {
                          const empColor = getEmpColor(duty.emp.id);
                          return (
                          <div key={idx} className={`${empColor.bg} p-2 sm:p-2.5 rounded-lg border ${empColor.border} shadow-sm hover:shadow transition-shadow`}>
                             <div className={`font-bold ${empColor.text} text-xs sm:text-sm mb-1.5 leading-tight`}>{duty.emp.name}</div>
                             <div className="flex items-start gap-1.5">
                                <span className={`${empColor.badge} text-white px-1.5 py-0.5 rounded text-[10px] sm:text-xs shrink-0 font-medium tracking-wide shadow-sm`}>{duty.code}</span>
                                <span className={`text-[10px] sm:text-xs ${empColor.text} leading-tight opacity-90`} title={duty.meaning}>{duty.meaning}</span>
                             </div>
                          </div>
                          )
                       }) : (
                         <div className="text-gray-400 text-center text-xs mt-6 italic flex flex-col items-center gap-2">
                           Trống
                         </div>
                       )}
                    </div>
                 </div>
               )
            })}
          </div>
        )}

        {viewMode === 'month' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
             <div className="overflow-x-auto h-full flex-1">
               <div className="min-w-[700px] h-full flex flex-col">
                 <div className="grid grid-cols-7 bg-gray-50 border-b shrink-0">
                    {dayNames.map((d, idx) => (
                       <div key={d} className={`p-2 sm:p-3 text-center font-bold text-xs uppercase tracking-wider ${idx >= 5 ? 'text-orange-600' : 'text-gray-600'}`}>{d}</div>
                    ))}
                 </div>
                 <div className="grid grid-cols-7 flex-1 auto-rows-fr">
                    {monthDays.map((item, idx) => {
                        const dateStr = getFormattedDateString(item.date);
                        const dayDuties = dailyDuties[dateStr] || [];
                        const isToday = getFormattedDateString(new Date()) === dateStr;
                        const isWeekend = item.date.getDay() === 0 || item.date.getDay() === 6;
                        
                        return (
                           <div key={idx} className={`border-r border-b p-1.5 sm:p-2 flex flex-col ${item.isCurrentMonth ? (isWeekend ? 'bg-orange-50/30' : 'bg-white') : 'bg-gray-50/50'} ${idx >= 28 && monthDays.length === 35 ? 'border-b-0' : ''}`}>
                              <div 
                                className={`text-right text-xs sm:text-sm mb-1.5 font-bold cursor-pointer hover:opacity-80 transition-opacity ${isToday ? 'text-white' : (item.isCurrentMonth ? (isWeekend ? 'text-orange-600' : 'text-gray-700') : 'text-gray-400')}`}
                                onClick={() => handleDayClick(item.date)}
                              >
                                 {isToday ? (
                                   <div className="flex items-center justify-end gap-1.5">
                                     <Star size={14} className="fill-yellow-400 text-yellow-400 drop-shadow-sm" />
                                     <span className="bg-[#006D5B] rounded-full w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center shadow-sm">{item.date.getDate()}</span>
                                   </div>
                                 ) : item.date.getDate()}
                              </div>
                              <div className="flex-1 space-y-1 sm:space-y-1.5 overflow-y-auto pr-0.5 sm:pr-1 custom-scrollbar">
                                 {dayDuties.map((duty, i) => {
                                     const empColor = getEmpColor(duty.emp.id);
                                     return (
                                     <div key={i} className={`text-xs flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-md ${empColor.bg} border ${empColor.border} hover:opacity-80 transition-opacity cursor-pointer`} title={`${duty.emp.name} - ${duty.meaning}`}>
                                        <span className={`font-bold text-white shrink-0 text-[9px] sm:text-[10px] ${empColor.badge} px-1 sm:px-1.5 py-0.5 rounded shadow-sm leading-none`}>{duty.code}</span>
                                        <span className={`truncate ${empColor.text} font-medium text-[10px] sm:text-xs leading-none`}>{duty.emp.name}</span>
                                     </div>
                                     )
                                 })}
                              </div>
                           </div>
                        )
                    })}
                 </div>
               </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// COMPONENT: EDIT SCHEDULE
// ==========================================
function EditSchedule({ employees, scheduleData, setScheduleData, abbreviations, config, refreshData, showAlert }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const monthKey = `${selectedMonth}_${selectedYear}`;
  
  const [editGrid, setEditGrid] = useState({});
  const [isSaved, setIsSaved] = useState(true);
  const [isSavingToCloud, setIsSavingToCloud] = useState(false);

  const daysInMonth = useMemo(() => getDaysInMonth(selectedMonth, selectedYear), [selectedMonth, selectedYear]);

  useEffect(() => {
    const monthData = scheduleData[monthKey] || {};
    const initialGrid = {};
    employees.forEach(emp => {
      initialGrid[emp.id] = { ...(monthData[emp.id] || {}) };
    });
    setEditGrid(initialGrid);
    setIsSaved(true);
  }, [monthKey, scheduleData, employees]);

  const handleCellChange = (empId, dateStr, value) => {
    setEditGrid(prev => {
      const newGrid = { ...prev };
      if (!newGrid[empId]) newGrid[empId] = {};
      newGrid[empId][dateStr] = value;
      return newGrid;
    });
    setIsSaved(false);
  };

  const handleSave = async () => {
    if (!config.apiWebAppUrl) {
      showAlert("Chưa cấu hình API Web App!", "error");
      return;
    }

    setIsSavingToCloud(true);
    
    const payload = {
      action: 'saveMonthSchedule',
      mapping: config.mapping,
      month: selectedMonth,
      year: selectedYear,
      gridData: employees.map(emp => ({
        rowIndex: emp.rowIndex,
        email: emp.email,
        data: editGrid[emp.id] || {}
      }))
    };

    try {
      const res = await fetch(config.apiWebAppUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
      
      const result = await res.json();
      
      if (result.success) {
        setIsSaved(true);
        showAlert("Đã lưu lịch trực thành công!");
        refreshData();
      } else {
        showAlert("Lỗi khi lưu: " + result.error, "error");
      }
    } catch (error) {
      console.error("Lỗi lưu:", error);
      showAlert("Không thể kết nối tới máy chủ!", "error");
    } finally {
      setIsSavingToCloud(false);
    }
  };

  const handlePaste = (e, startEmpIdx, startDateIdx) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    if (!pasteData) return;

    const rows = pasteData.split('\n').map(row => row.split('\t'));
    
    setEditGrid(prev => {
      const newGrid = { ...prev };
      let updated = false;

      for (let r = 0; r < rows.length; r++) {
        const targetEmpIdx = startEmpIdx + r;
        if (targetEmpIdx >= employees.length) break;
        
        const emp = employees[targetEmpIdx];
        if (!newGrid[emp.id]) newGrid[emp.id] = {};

        for (let c = 0; c < rows[r].length; c++) {
          const targetDateIdx = startDateIdx + c;
          if (targetDateIdx >= daysInMonth.length) break;
          
          const dateStr = formatDate(daysInMonth[targetDateIdx]);
          const val = rows[r][c].trim();
          if (val !== undefined) {
             newGrid[emp.id][dateStr] = val;
             updated = true;
          }
        }
      }
      if (updated) setIsSaved(false);
      return newGrid;
    });
  };

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-4 sm:mb-6 mt-2 sm:mt-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" style={{ color: HEADER_COLOR }}>Cập Nhật Lịch Trực</h1>
          <p className="text-gray-500 text-xs sm:text-sm mt-1">
            Chọn một ô bất kỳ và bấm <strong>Ctrl+V</strong> để dán dữ liệu từ Excel.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center w-full xl:w-auto">
          <div className="flex gap-2 w-full sm:w-auto">
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))} className="border py-2 px-3 rounded-md shadow-sm flex-1 sm:flex-none" style={{ backgroundColor: BG_CONTAINER }}>
              {[...Array(12).keys()].map(i => <option key={i+1} value={i+1}>Tháng {i+1}</option>)}
            </select>
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="border py-2 px-3 rounded-md shadow-sm flex-1 sm:flex-none" style={{ backgroundColor: BG_CONTAINER }}>
              {[2025, 2026, 2027].map(y => <option key={y} value={y}>Năm {y}</option>)}
            </select>
          </div>
          <button 
            onClick={handleSave}
            disabled={isSaved || isSavingToCloud}
            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md font-semibold transition-colors w-full sm:w-auto ${
              isSaved ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'text-white shadow-sm hover:opacity-90'
            }`}
            style={!isSaved ? { backgroundColor: HEADER_COLOR } : {}}
          >
            {isSavingToCloud ? <Loader className="animate-spin" size={18} /> : <Save size={18} />}
            {isSavingToCloud ? 'Đang lưu...' : (isSaved ? 'Đã lưu' : 'Lưu lịch trực')}
          </button>
        </div>
      </div>

      <div className="border rounded-lg shadow-sm flex-1 overflow-hidden flex flex-col" style={{ backgroundColor: BG_CONTAINER }}>
        <div className="overflow-x-auto flex-1 custom-scrollbar">
          <table className="w-full border-collapse min-w-max bg-white">
            <thead className="bg-amber-50 sticky top-0 z-10 shadow-sm border-b border-amber-200">
              <tr>
                <th className="border-r border-amber-100 p-2 text-center w-36 sm:w-48 sticky left-0 bg-amber-50 z-20 text-gray-700 font-bold text-xs sm:text-sm">Họ và tên</th>
                <th className="border-r border-amber-100 p-2 text-center w-32 sm:w-48 sticky left-36 sm:left-48 bg-amber-50 z-20 text-gray-700 font-bold text-xs sm:text-sm">Email</th>
                {daysInMonth.map((date, idx) => (
                  <th key={idx} className="border-r border-amber-100 p-2 min-w-[40px] sm:min-w-[50px] text-center text-[10px] sm:text-xs font-bold text-gray-600">
                    {formatDisplayDate(date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                 <tr><td colSpan={daysInMonth.length + 2} className="p-8 text-center text-gray-400">Chưa có dữ liệu Cán bộ.</td></tr>
              ) : employees.map((emp, rIdx) => (
                <tr key={emp.id} className="hover:bg-amber-50/30 focus-within:bg-amber-50/50">
                  <td className="border p-2 sticky left-0 bg-white font-medium z-10 whitespace-nowrap text-gray-800 shadow-[1px_0_0_0_#fef3c7] text-xs sm:text-sm">{emp.name}</td>
                  <td className="border p-2 sticky left-36 sm:left-48 bg-white text-gray-500 text-[10px] sm:text-xs z-10 shadow-[1px_0_0_0_#fef3c7] truncate max-w-[120px] sm:max-w-[190px]">{emp.email}</td>
                  {daysInMonth.map((date, cIdx) => {
                    const dateStr = formatDate(date);
                    const val = editGrid[emp.id]?.[dateStr] || '';
                    
                    return (
                      <td key={cIdx} className="border p-0 m-0 w-[40px] sm:w-[50px]">
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => handleCellChange(emp.id, dateStr, e.target.value)}
                          onPaste={(e) => handlePaste(e, rIdx, cIdx)}
                          className="w-full h-full min-h-[32px] sm:min-h-[36px] px-1 text-center font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-transparent uppercase text-xs sm:text-sm"
                          style={{ color: HEADER_COLOR }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENT: MANAGE EMPLOYEES
// ==========================================
function ManageEmployees({ employees, config, refreshData, showAlert, showConfirm }) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentEmp, setCurrentEmp] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.target);
    
    const payload = {
      action: 'saveEmployee',
      mapping: config.mapping,
      employee: {
        name: formData.get('name'),
        email: formData.get('email'),
        rowIndex: currentEmp?.rowIndex || null
      }
    };

    try {
      const res = await fetch(config.apiWebAppUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
      const result = await res.json();
      if (result.success) {
        showAlert("Đã lưu thông tin Cán bộ thành công!");
        setIsEditing(false);
        refreshData(); 
      } else {
        showAlert("Lỗi từ hệ thống: " + result.error, "error");
      }
    } catch (error) {
      showAlert("Lỗi kết nối khi lưu Cán bộ!", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (rowIndex) => {
    if (!rowIndex) {
      showAlert("Dữ liệu cán bộ không hợp lệ. Vui lòng thử tải lại trang.", "error");
      return;
    }
    
    showConfirm("Bạn có chắc muốn xóa Cán bộ này?", async () => {
      try {
        const res = await fetch(config.apiWebAppUrl, {
          method: 'POST',
          body: JSON.stringify({ action: 'deleteEmployee', mapping: config.mapping, rowIndex }),
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await res.json();
        if (result.success) {
          showAlert("Đã xóa Cán bộ thành công!");
          refreshData();
        } else {
          showAlert("Lỗi xóa từ Google Sheet: " + result.error, "error");
        }
      } catch(e) {
        showAlert("Lỗi kết nối khi xóa!", "error");
      }
    });
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6 mt-2 sm:mt-4">
        <h1 className="text-xl sm:text-2xl font-bold" style={{ color: HEADER_COLOR }}>Quản Lý Cán Bộ</h1>
        <button 
          onClick={() => { setCurrentEmp(null); setIsEditing(true); }}
          className="flex items-center justify-center gap-2 text-white px-4 py-2 rounded shadow hover:opacity-90 w-full sm:w-auto"
          style={{ backgroundColor: HEADER_COLOR }}
        >
          <Plus size={18} /> Thêm Cán Bộ
        </button>
      </div>

      {isEditing && (
        <div className="p-4 sm:p-6 rounded-lg shadow-sm border mb-6" style={{ backgroundColor: BG_CONTAINER }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: HEADER_COLOR }}>{currentEmp ? 'Sửa Cán Bộ' : 'Thêm Cán Bộ Mới'}</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Họ và tên</label>
              <input name="name" defaultValue={currentEmp?.name} required className="w-full border rounded p-2 focus:ring-2 focus:outline-none" style={{ focusRingColor: HEADER_COLOR }} />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
              <input name="email" type="email" defaultValue={currentEmp?.email} required className="w-full border rounded p-2 focus:ring-2 focus:outline-none" style={{ focusRingColor: HEADER_COLOR }} />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={isSaving} className="flex-1 sm:flex-none text-white px-6 py-2 rounded font-bold hover:opacity-90" style={{ backgroundColor: HEADER_COLOR }}>
                {isSaving ? 'Đang lưu...' : 'Lưu'}
              </button>
              <button type="button" onClick={() => setIsEditing(false)} className="flex-1 sm:flex-none bg-gray-200 text-gray-700 px-6 py-2 rounded font-bold hover:bg-gray-300">Hủy</button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-lg shadow-sm border overflow-x-auto" style={{ backgroundColor: BG_CONTAINER }}>
        <table className="w-full text-left border-collapse min-w-[500px]">
          <thead className="border-b" style={{ backgroundColor: '#e6f0ee', color: HEADER_COLOR }}>
            <tr>
              <th className="p-3 whitespace-nowrap">Họ và tên</th>
              <th className="p-3 whitespace-nowrap">Email</th>
              <th className="p-3 w-24 text-center whitespace-nowrap">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr><td colSpan={3} className="p-6 text-center text-gray-500">Chưa có dữ liệu</td></tr>
            ) : employees.map(emp => (
              <tr key={emp.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium text-gray-800">{emp.name}</td>
                <td className="p-3 text-gray-600 text-xs sm:text-sm">{emp.email}</td>
                <td className="p-3 flex justify-center gap-3">
                  <button onClick={() => { setCurrentEmp(emp); setIsEditing(true); }} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded" title="Sửa"><Edit size={16} /></button>
                  <button onClick={() => handleDelete(emp.rowIndex)} className="text-red-600 hover:bg-red-50 p-1.5 rounded" title="Xóa"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENT: MANAGE ABBREVIATIONS
// ==========================================
function ManageAbbreviations({ abbreviations, config, refreshData, showAlert, showConfirm }) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentAbbr, setCurrentAbbr] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.target);
    
    const payload = {
      action: 'saveAbbreviation',
      mapping: config.mapping,
      abbreviation: {
        code: formData.get('code'),
        meaning: formData.get('meaning'),
        originalCode: currentAbbr?.code || null
      }
    };

    try {
      const res = await fetch(config.apiWebAppUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
      const result = await res.json();
      if (result.success) {
        showAlert("Đã lưu thành công!");
        setIsEditing(false);
        refreshData(); 
      } else {
        showAlert("Lỗi: " + result.error, "error");
      }
    } catch (error) {
      showAlert("Lỗi kết nối khi lưu!", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (code) => {
    showConfirm("Bạn có chắc muốn xóa Từ viết tắt này?", async () => {
      try {
        const res = await fetch(config.apiWebAppUrl, {
          method: 'POST',
          body: JSON.stringify({ action: 'deleteAbbreviation', mapping: config.mapping, code }),
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }
        });
        const result = await res.json();
        if (result.success) {
          showAlert("Đã xóa thành công!");
          refreshData();
        } else {
          showAlert("Lỗi: " + result.error, "error");
        }
      } catch(e) {
        showAlert("Lỗi kết nối!", "error");
      }
    });
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 sm:mb-6 mt-2 sm:mt-4">
        <h1 className="text-xl sm:text-2xl font-bold" style={{ color: HEADER_COLOR }}>Danh Mục Từ Viết Tắt</h1>
        <button 
          onClick={() => { setCurrentAbbr(null); setIsEditing(true); }}
          className="flex items-center justify-center gap-2 text-white px-4 py-2 rounded shadow hover:opacity-90 w-full sm:w-auto"
          style={{ backgroundColor: HEADER_COLOR }}
        >
          <Plus size={18} /> Thêm Mã
        </button>
      </div>

      {isEditing && (
        <div className="p-4 sm:p-6 rounded-lg shadow-sm border mb-6" style={{ backgroundColor: BG_CONTAINER }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: HEADER_COLOR }}>{currentAbbr ? 'Sửa Từ Viết Tắt' : 'Thêm Từ Viết Tắt'}</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Từ viết tắt (Mã)</label>
              <input name="code" defaultValue={currentAbbr?.code} required className="w-full border rounded p-2 focus:ring-2 focus:outline-none uppercase" style={{ focusRingColor: HEADER_COLOR }} />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Ý nghĩa</label>
              <input name="meaning" defaultValue={currentAbbr?.meaning} required className="w-full border rounded p-2 focus:ring-2 focus:outline-none" style={{ focusRingColor: HEADER_COLOR }} />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={isSaving} className="flex-1 sm:flex-none text-white px-6 py-2 rounded font-bold hover:opacity-90" style={{ backgroundColor: HEADER_COLOR }}>
                {isSaving ? 'Đang lưu...' : 'Lưu'}
              </button>
              <button type="button" onClick={() => setIsEditing(false)} className="flex-1 sm:flex-none bg-gray-200 text-gray-700 px-6 py-2 rounded font-bold hover:bg-gray-300">Hủy</button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-lg shadow-sm border overflow-x-auto" style={{ backgroundColor: BG_CONTAINER }}>
        <table className="w-full text-left border-collapse min-w-[500px]">
          <thead className="border-b" style={{ backgroundColor: '#e6f0ee', color: HEADER_COLOR }}>
            <tr>
              <th className="p-3 w-24 sm:w-32 whitespace-nowrap">Từ viết tắt</th>
              <th className="p-3 min-w-[200px]">Ý nghĩa</th>
              <th className="p-3 w-24 text-center whitespace-nowrap">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {abbreviations.length === 0 ? (
              <tr><td colSpan={3} className="p-6 text-center text-gray-500">Chưa có dữ liệu</td></tr>
            ) : abbreviations.map(abbr => (
              <tr key={abbr.code} className="border-b hover:bg-gray-50">
                <td className="p-3 font-bold" style={{ color: HEADER_COLOR }}>{abbr.code}</td>
                <td className="p-3 text-gray-600 text-sm">{abbr.meaning}</td>
                <td className="p-3 flex justify-center gap-3">
                  <button onClick={() => { setCurrentAbbr(abbr); setIsEditing(true); }} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded" title="Sửa"><Edit size={16} /></button>
                  <button onClick={() => handleDelete(abbr.code)} className="text-red-600 hover:bg-red-50 p-1.5 rounded" title="Xóa"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENT: SYSTEM ADMIN
// ==========================================
function SystemAdmin({ config, setConfig, appUsers, setAppUsers, showAlert, showConfirm }) {
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [currentUserEdit, setCurrentUserEdit] = useState(null);
  const [selectedPermissions, setSelectedPermissions] = useState([]);

  const [apiWebAppUrl, setApiWebAppUrl] = useState(config.apiWebAppUrl || '');
  const [isDetecting, setIsDetecting] = useState(false);
  const [availableSheets, setAvailableSheets] = useState([]);
  
  const [sheetMapping, setSheetMapping] = useState({ 
    schedule: config.mapping?.schedule || '', 
    abbreviations: config.mapping?.abbreviations || '',
    users: config.mapping?.users || '' 
  });

  useEffect(() => {
    if (currentUserEdit && currentUserEdit.Permissions) {
      setSelectedPermissions(currentUserEdit.Permissions.split(','));
    } else if (!currentUserEdit) {
      setSelectedPermissions([]);
    }
  }, [currentUserEdit]);

  const handleTogglePermission = (featureId) => {
    setSelectedPermissions(prev => 
      prev.includes(featureId) 
        ? prev.filter(id => id !== featureId)
        : [...prev, featureId]
    );
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const username = formData.get('username');
    const rawPassword = formData.get('password');
    
    let finalPasswordHash = currentUserEdit ? currentUserEdit.Password : '';
    if (rawPassword) {
      finalPasswordHash = await sha256(rawPassword);
    }

    const newUser = {
      User: username,
      Password: finalPasswordHash,
      Permissions: selectedPermissions.join(',')
    };

    try {
      const response = await fetch(config.apiWebAppUrl, {
        method: 'POST',
        body: JSON.stringify({
          action: 'saveUser',
          mapping: config.mapping,
          user: newUser
        }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        if (currentUserEdit) {
          setAppUsers(appUsers.map(u => u.User === currentUserEdit.User ? newUser : u));
        } else {
          setAppUsers([...appUsers, newUser]);
        }
        showAlert("Lưu tài khoản thành công!");
        setIsEditingUser(false);
      } else {
        showAlert("Lỗi: " + result.error, "error");
      }
    } catch (error) {
      showAlert("Lỗi kết nối khi lưu!", "error");
    }
  };

  const handleDeleteUser = (username) => {
    if (username === 'admin') {
      showAlert("Không thể xóa tài khoản admin!", "error");
      return;
    }
    showConfirm("Tính năng xóa User cần thực hiện trực tiếp trên Sheet.", () => {});
  };

  const handleDetectSheets = async () => {
    if (!apiWebAppUrl.includes('script.google.com/macros/s/')) {
      showAlert("URL Web App không hợp lệ!", "error");
      return;
    }
    
    setIsDetecting(true);
    try {
      const response = await fetch(`${apiWebAppUrl}?action=getSheets`);
      const data = await response.json();
      
      if (data.success) {
        setAvailableSheets(data.sheets);
        showAlert("Đã quét danh sách Sheet!");
      } else {
        showAlert("Lỗi: " + data.error, "error");
      }
    } catch (error) {
      showAlert("Không thể kết nối Google Sheet.", "error");
    } finally {
      setIsDetecting(false);
    }
  };

  const handleSaveMapping = () => {
    if (!apiWebAppUrl) {
      showAlert("Vui lòng nhập link!", "error");
      return;
    }
    if (!sheetMapping.schedule || !sheetMapping.abbreviations || !sheetMapping.users) {
      showAlert("Vui lòng map đủ 3 sheet!", "error");
      return;
    }
    
    setConfig({
      apiWebAppUrl: apiWebAppUrl,
      mapping: sheetMapping
    });
    showAlert("Lưu cấu hình thành công!");
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto w-full">
      <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 mt-2 sm:mt-4" style={{ color: HEADER_COLOR }}>Quản Trị Hệ Thống</h1>
      
      <div className="rounded-lg shadow-sm border overflow-hidden mb-6 sm:mb-8" style={{ backgroundColor: BG_CONTAINER }}>
        <div className="p-3 sm:p-4 border-b font-bold flex items-center gap-2 text-sm sm:text-base" style={{ backgroundColor: '#e6f0ee', color: HEADER_COLOR }}>
          <BookOpen size={18} /> Cấu hình API Google Sheet
        </div>
        <div className="p-3 sm:p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Đường dẫn Web App (Apps Script URL)</label>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <input 
                type="text" 
                value={apiWebAppUrl}
                onChange={(e) => setApiWebAppUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/..." 
                className="w-full sm:flex-1 border rounded p-2 sm:p-2.5 focus:ring-2 outline-none text-xs sm:text-sm"
                style={{ focusRingColor: HEADER_COLOR }} 
              />
              <button 
                onClick={handleDetectSheets}
                disabled={!apiWebAppUrl || isDetecting}
                className="text-white px-4 py-2.5 rounded disabled:bg-gray-400 whitespace-nowrap text-sm font-bold shadow-sm transition-opacity hover:opacity-90 w-full sm:w-auto"
                style={{ backgroundColor: HEADER_COLOR }}
              >
                {isDetecting ? 'Đang tải...' : 'Nhận diện Sheet'}
              </button>
            </div>
          </div>

          {(availableSheets.length > 0 || config.apiWebAppUrl) && (
            <div className="mt-4 p-3 sm:p-4 border rounded animate-in fade-in duration-300" style={{ backgroundColor: BG_BODY }}>
              <h3 className="font-bold mb-3 text-sm text-gray-800">Cấu hình ánh xạ dữ liệu (Mapping)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
                <div>
                  <label className="block text-xs sm:text-sm text-gray-600 mb-1">Lịch Trực</label>
                  <select 
                    value={sheetMapping.schedule}
                    onChange={(e) => setSheetMapping({...sheetMapping, schedule: e.target.value})}
                    className="w-full border rounded p-2 text-sm bg-white"
                  >
                    <option value="">-- Chọn --</option>
                    {availableSheets.map(s => <option key={s} value={s}>{s}</option>)}
                    {!availableSheets.length && config.mapping.schedule && <option value={config.mapping.schedule}>{config.mapping.schedule}</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm text-gray-600 mb-1">Từ Viết Tắt</label>
                  <select 
                    value={sheetMapping.abbreviations}
                    onChange={(e) => setSheetMapping({...sheetMapping, abbreviations: e.target.value})}
                    className="w-full border rounded p-2 text-sm bg-white"
                  >
                    <option value="">-- Chọn --</option>
                    {availableSheets.map(s => <option key={s} value={s}>{s}</option>)}
                    {!availableSheets.length && config.mapping.abbreviations && <option value={config.mapping.abbreviations}>{config.mapping.abbreviations}</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm text-gray-600 mb-1">Tài khoản</label>
                  <select 
                    value={sheetMapping.users}
                    onChange={(e) => setSheetMapping({...sheetMapping, users: e.target.value})}
                    className="w-full border rounded p-2 text-sm bg-white border-blue-300"
                  >
                    <option value="">-- Chọn --</option>
                    {availableSheets.map(s => <option key={s} value={s}>{s}</option>)}
                    {!availableSheets.length && config.mapping.users && <option value={config.mapping.users}>{config.mapping.users}</option>}
                  </select>
                </div>
              </div>
              <button onClick={handleSaveMapping} className="w-full sm:w-auto text-white px-4 py-2.5 rounded shadow text-sm flex items-center justify-center gap-2 font-bold hover:opacity-90" style={{ backgroundColor: HEADER_COLOR }}>
                <Save size={16} /> Lưu cấu hình Mapping
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg shadow-sm border overflow-hidden mb-8" style={{ backgroundColor: BG_CONTAINER }}>
        <div className="p-3 sm:p-4 border-b font-bold flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3" style={{ backgroundColor: '#e6f0ee', color: HEADER_COLOR }}>
          <span className="text-sm sm:text-base">Quản lý Tài khoản</span>
          <button 
            onClick={() => { setCurrentUserEdit(null); setIsEditingUser(true); }}
            className="flex items-center justify-center gap-1 text-white px-3 py-1.5 rounded text-sm shadow hover:opacity-90 w-full sm:w-auto"
            style={{ backgroundColor: HEADER_COLOR }}
          >
            <Plus size={16} /> Thêm User
          </button>
        </div>

        {isEditingUser && (
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <h3 className="font-bold mb-3 text-sm text-gray-800">{currentUserEdit ? 'Sửa thông tin User' : 'Thêm User mới'}</h3>
            <form onSubmit={handleSaveUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1 text-gray-700">Tài khoản (User)</label>
                  <input name="username" defaultValue={currentUserEdit?.User} readOnly={!!currentUserEdit} required className={`w-full border rounded p-2 text-sm ${currentUserEdit ? 'bg-gray-100 text-gray-500' : 'bg-white'}`} />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-gray-700">Mật khẩu {currentUserEdit && '(Nhập để đổi)'}</label>
                  <input name="password" type="password" placeholder={currentUserEdit ? '***' : 'Mật khẩu'} required={!currentUserEdit} className="w-full border rounded p-2 text-sm" />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold mb-2 text-gray-700">Phân quyền chức năng</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white p-3 border rounded">
                  {APP_FEATURES.map(feature => (
                    <label key={feature.id} className="flex items-center gap-2 cursor-pointer p-1">
                      <input 
                        type="checkbox" 
                        checked={selectedPermissions.includes(feature.id) || currentUserEdit?.User === 'admin'}
                        onChange={() => handleTogglePermission(feature.id)}
                        className="rounded focus:ring-[#006D5B] w-4 h-4"
                        style={{ accentColor: HEADER_COLOR }}
                        disabled={currentUserEdit?.User === 'admin'}
                      />
                      <span className="text-sm text-gray-700">{feature.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 mt-4 pt-2 border-t border-gray-200">
                <button type="submit" className="flex-1 sm:flex-none text-white px-6 py-2 rounded text-sm font-bold hover:opacity-90" style={{ backgroundColor: HEADER_COLOR }}>Lưu User</button>
                <button type="button" onClick={() => setIsEditingUser(false)} className="flex-1 sm:flex-none bg-gray-200 text-gray-700 px-6 py-2 rounded text-sm font-bold hover:bg-gray-300">Hủy</button>
              </div>
            </form>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[500px]">
            <thead className="border-b bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3 whitespace-nowrap">Tài khoản</th>
                <th className="p-3 whitespace-nowrap">Mật khẩu</th>
                <th className="p-3 min-w-[150px]">Quyền</th>
                <th className="p-3 text-center w-24 whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {appUsers.length === 0 ? (
                <tr><td colSpan={4} className="p-6 text-center text-gray-500 text-sm">Chưa có dữ liệu</td></tr>
              ) : appUsers.map(u => (
                <tr key={u.User} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium text-gray-800">{u.User}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 rounded text-[10px] sm:text-xs font-bold bg-green-100 text-green-700 whitespace-nowrap">
                      {u.Password ? 'Đã thiết lập' : 'Chưa thiết lập'}
                    </span>
                  </td>
                  <td className="p-3 text-xs sm:text-sm text-gray-600">
                    {u.User === 'admin' ? 'Tất cả quyền' : (u.Permissions ? u.Permissions.replace(/,/g, ', ') : 'Chưa cấp quyền')}
                  </td>
                  <td className="p-3 flex justify-center gap-2">
                    <button onClick={() => { setCurrentUserEdit(u); setIsEditingUser(true); }} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded" title="Sửa"><Edit size={16} /></button>
                    <button onClick={() => handleDeleteUser(u.User)} className={`hover:bg-red-50 p-1.5 rounded ${u.User === 'admin' ? 'text-gray-300 cursor-not-allowed' : 'text-red-600'}`} title="Xóa" disabled={u.User === 'admin'}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// UTILS: LOGIN MODAL
// ==========================================
function LoginModal({ onLogin }) {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError('');
    
    const success = await onLogin(username, password);
    
    if (success) {
      setIsOpen(false);
      setUsername('');
      setPassword('');
    } else {
      setError('Sai tài khoản hoặc mật khẩu');
    }
    setIsLoggingIn(false);
  };

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="flex items-center gap-2 text-emerald-100 hover:text-white w-full transition-colors p-2 lg:p-0 rounded-lg lg:rounded-none bg-black/20 lg:bg-transparent justify-center lg:justify-start">
        <LogIn size={18} /> <span className="font-bold lg:font-normal">Đăng nhập quản lý</span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
      <div className="p-6 rounded-xl shadow-2xl w-full max-sm relative" style={{ backgroundColor: BG_CONTAINER }}>
        <button className="absolute top-4 right-4 text-gray-400 hover:text-gray-800" onClick={() => setIsOpen(false)}><X size={20}/></button>
        <h2 className="text-xl font-bold mb-6 text-center" style={{ color: HEADER_COLOR }}>Đăng nhập</h2>
        {error && <div className="text-red-600 text-xs mb-4 text-center bg-red-50 p-2.5 rounded border border-red-100 font-medium">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-1.5 text-gray-700 uppercase tracking-wide">Tài khoản</label>
            <input type="text" value={username} onChange={e=>setUsername(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-gray-900 focus:ring-2 focus:outline-none bg-gray-50 focus:bg-white" style={{ focusRingColor: HEADER_COLOR }} placeholder="Tên đăng nhập" />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1.5 text-gray-700 uppercase tracking-wide">Mật khẩu</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 text-gray-900 focus:ring-2 focus:outline-none bg-gray-50 focus:bg-white" placeholder="***" />
          </div>
          <div className="pt-4">
            <button type="submit" disabled={isLoggingIn} className="w-full text-white py-3 rounded-lg font-bold text-base hover:opacity-90 disabled:opacity-50 transition-opacity shadow-md" style={{ backgroundColor: HEADER_COLOR }}>
              {isLoggingIn ? 'Đang xác thực...' : 'Đăng nhập'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="p-6 sm:p-10 flex flex-col items-center justify-center h-full text-gray-500 text-center">
      <AlertCircle size={48} className="mb-4 text-red-400" />
      <h2 className="text-lg sm:text-xl font-bold mb-2 text-gray-700">Không có quyền truy cập</h2>
      <p className="text-sm">Vui lòng đăng nhập để sử dụng chức năng này.</p>
    </div>
  );
}
