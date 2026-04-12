import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  X,
  HistoryIcon,
  Star,
  Sparkles,
  MusicIcon,
  InfoIcon,
  MessageCircleIcon,
  CloudIcon,
  HardDriveDownload,
  SettingsIcon,
} from "lucide-react";

const menuList = [
  { title: "历史记录", icon: <HistoryIcon className="w-4 h-4" />, to: "/" },
  { title: "收藏夹", icon: <Star className="w-4 h-4" />, to: "/favorites" },
  { title: "AI 探索", icon: <Sparkles className="w-4 h-4 text-indigo-500" />, to: "/ai-search" },
  { title: "搜索音乐", icon: <MusicIcon className="w-4 h-4" />, to: "/music/search" },
  { title: "我喜欢的音乐", icon: <MusicIcon className="w-4 h-4" />, to: "/music/liked" },
  { title: "关于", icon: <InfoIcon className="w-4 h-4" />, to: "/about" },
  { title: "反馈", icon: <MessageCircleIcon className="w-4 h-4" />, to: "/feedback" },
  { title: "云同步", icon: <CloudIcon className="w-4 h-4" />, to: "/cloud-sync" },
  { title: "WebDAV", icon: <HardDriveDownload className="w-4 h-4" />, to: "/webdav-sync" },
  { title: "设置", icon: <SettingsIcon className="w-4 h-4" />, to: "/settings" },
];

export const SidepanelNav = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);

  const currentPage = menuList.find((item) => item.to === location.pathname)?.title || "历史记录";

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={menuRef} className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-semibold text-gray-800 truncate">{currentPage}</span>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 rounded hover:bg-gray-100"
          aria-label="导航菜单"
        >
          {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>
      {isOpen && (
        <nav className="absolute left-0 w-full bg-white border-b border-gray-200 shadow-lg">
          {menuList.map((item) => (
            <button
              key={item.to}
              onClick={() => {
                navigate(item.to);
                setIsOpen(false);
              }}
              className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left hover:bg-gray-50 ${
                location.pathname === item.to ? "bg-gray-100 font-medium text-[#00a1d6]" : "text-gray-700"
              }`}
            >
              {item.icon}
              {item.title}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
};
