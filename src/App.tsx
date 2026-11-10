// src/App.tsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import FileCenter from './pages/FileCenter';
import AICopilot from './pages/AICopilot';

function App() {
  return (
    <Router>
      <div className="flex h-screen w-full font-sans text-gray-200 bg-[#1e2128] overflow-hidden">
        {/* 全局无感平滑导航栏 */}
        <Sidebar />

        {/* 核心工作主视窗 */}
        <main className="flex-1 relative overflow-hidden h-full">
          <Routes>
            <Route path="/" element={<Navigate to="/file-center" replace />} />
            <Route path="/file-center/*" element={<FileCenter />} />
            <Route path="/ai-copilot/*" element={<AICopilot />} />
            <Route
              path="*"
              element={
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  404 - 找不到指定业务模块
                </div>
              }
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;