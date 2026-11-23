'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { canManageAccess } from '@/lib/hospitalAccess';

export default function Navbar() {
    const { user, logout } = useAuth();

    return (
        <nav className="bg-gray-800 shadow px-6 py-4 flex items-center justify-between">
            {/* Left side: Navigation Links */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {user && (
                    <>
                        <Link href="/data" className="text-white hover:text-blue-600">Dashboard</Link>
                        <Link href="/devices" className="text-white hover:text-blue-600">Devices</Link>
                        <Link href="/history" className="text-white hover:text-blue-500">History</Link>
                        <Link href="/profile" className="text-white hover:text-blue-500">My Profile</Link>
                        {canManageAccess(user) && (
                            <Link href="/access" className="text-white hover:text-blue-500">Manage Access</Link>
                        )}

                    </>
                )}
            </div>

            {/* Right side: Auth Links */}
            <div className="flex items-center gap-4">
                {user ? (
                    <>
                        <button
                            onClick={logout}
                            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
                        >
                            Logout
                        </button>
                    </>
                ) : (
                    <>
                        <Link href="/login" className="text-white hover:text-blue-600">Login</Link>
                        <Link href="/register" className="text-white hover:text-blue-600">Register</Link>
                    </>
                )}
            </div>
        </nav>
    );
}
