import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useState } from "react";


// Components
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import EntryScreen from "./pages/EntryScreen";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";
import AdminUserDetail from "./pages/AdminUserDetail";
import NotFound from "./pages/NotFound";
import WorkflowBuilder from "./pages/WorkflowBuilder";
import WhatsAppSetup from "./pages/WhatsAppSetup";
import SocialMediaStudio from "./pages/SocialMediaStudio";
import UserProfile from "./pages/UserProfile";
import AboutUs from "./pages/AboutUs";
import ContactUs from "./pages/ContactUs";
import AdminContactManagement from "./pages/AdminContactManagement";
import UserWorkflows from "./pages/UserWorkflows";
import PublicOnlyRoute from "@/components/auth/PublicOnlyRoute";
import SocialMediaVerification from "./pages/SocialMediaVerification";

const queryClient = new QueryClient();

// REPLACE THIS WITH YOUR GOOGLE CLIENT ID
const GOOGLE_CLIENT_ID = "837661787288-f8q3h98e5viu62h6v14ot4lel8m0tc8l.apps.googleusercontent.com";

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(
    !!localStorage.getItem("access_token")
  );

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<EntryScreen />} />
              <Route path="/about" element={<AboutUs />} />
              <Route path="/contact" element={<ContactUs />} />

              <Route 
  path="/login" 
  element={
    <PublicOnlyRoute>
      <Login setAuth={setIsAuthenticated} />
    </PublicOnlyRoute>
  } 
/>
<Route 
  path="/signup" 
  element={
    <PublicOnlyRoute>
      <Signup setAuth={setIsAuthenticated} />
    </PublicOnlyRoute>
  } 
/>
              {/* Protected User Routes */}
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<Dashboard isAuthenticated={isAuthenticated} />} />
                <Route path="/workflow-builder" element={<WorkflowBuilder />} />
                <Route path="/whatsapp-setup" element={<WhatsAppSetup />} />
                <Route path="/social-media-studio" element={<SocialMediaStudio />} />
                <Route path="/profile" element={<UserProfile />} />
              </Route>

              {/* Protected Admin Routes (Role = Administrator) */}
              <Route element={<ProtectedRoute requiredRole="Administrator" />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/user/:userId" element={<AdminUserDetail />} />
                {/* Add this line: */}
                <Route path="/admin/contacts" element={<AdminContactManagement />} />
              </Route>
              <Route path="/user-workflows" element={<UserWorkflows />} />
              <Route path="/social-media-verification" element={<SocialMediaVerification />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
};

export default App;