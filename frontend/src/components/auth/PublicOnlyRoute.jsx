import { Navigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";

const PublicOnlyRoute = ({ children }) => {
  const token = localStorage.getItem("access_token");
  
  if (token) {
    try {
      const decoded = jwtDecode(token);
      const roles = decoded.roles || decoded.role || [];
      const rolesArray = Array.isArray(roles) ? roles : [roles];
      
      // Redirect based on role
      if (rolesArray.includes("Administrator")) {
        return <Navigate to="/admin" replace />;
      }
      // Regular user goes to dashboard
      return <Navigate to="/dashboard" replace />;
    } catch (error) {
      // Invalid token, clear it and allow access to public route
      localStorage.removeItem("access_token");
      return children;
    }
  }
  
  return children;
};

export default PublicOnlyRoute;