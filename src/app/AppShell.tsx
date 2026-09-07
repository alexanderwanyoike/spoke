import { isTauri } from "@tauri-apps/api/core";
import { UpdateControl } from "../update/UpdateControl";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { MessageSquare, Sun, Moon, LogOut, UserRound, UsersRound, House, Bell } from "lucide-react";

export function AppShell({
  account,
  disconnect,
  children
}: {
  account: ReactNode;
  disconnect(): void;
  children: ReactNode;
}) {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("spoke.appearance");
    if (saved) return saved === "dark";
    return matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("spoke.appearance", dark ? "dark" : "light");
  }, [dark]);
  return (
    <div className="spoke-shell">
      <aside className="app-rail">
        <Link className="brand" to="/home" aria-label="Spoke home">
          <img src="/favicon.svg" alt="" />
          <span>Spoke</span>
        </Link>
        <nav aria-label="Main navigation">
          <NavLink className="rail-link" aria-label="Home" to="/home">
            <House size={19} />
            <span>Home</span>
          </NavLink>
          <NavLink className="rail-link" aria-label="Messages" to="/messages">
            <MessageSquare size={19} />
            <span>Messages</span>
          </NavLink>
          <NavLink className="rail-link" aria-label="People" to="/people">
            <UsersRound size={19} />
            <span>People</span>
          </NavLink>
          <NavLink className="rail-link" aria-label="Activity" to="/activity">
            <Bell size={19} />
            <span>Activity</span>
          </NavLink>
          <NavLink className="rail-link" aria-label="My profile" to="/profile">
            <UserRound size={19} />
            <span>My profile</span>
          </NavLink>
        </nav>
        <div className="rail-bottom">
          {isTauri() && <UpdateControl />}
          <button
            className="rail-link"
            onClick={() => setDark((value) => !value)}
            aria-label={dark ? "Use light appearance" : "Use dark appearance"}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
            <span>Appearance</span>
          </button>
          {account}
          <button
            className="rail-link"
            aria-label="Forget access"
            onClick={disconnect}
            title="Forgets access on this device. Revoke the session in Jolt Console."
          >
            <LogOut size={16} />
            <span>Forget access</span>
          </button>
        </div>
      </aside>
      {children}
    </div>
  );
}
