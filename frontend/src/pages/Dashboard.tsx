/**
 * File: Dashboard.tsx
 * Author: Hiba Noor
 *
 * Purpose:
 *   Renders the BizBot dashboard, displaying real-time metrics,
 *   automation service cards, and user profile information.
 *   - Fetches user profile on mount
 *   - Shows automation service cards with metrics, charts, and actions
 *   - Displays real-time performance metrics
 *   - Header with notifications, profile, logout
 *   - Footer with company info, quick links, and contact details
 */

import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  MessageSquare,
  Share2,
  GitBranch,
  Bell,
  LogOut,
  Users,
  Zap,
  CheckCircle,
  ArrowRight,
  TrendingUp,
  Mail,
  Phone,
  MapPin,
   Clock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import BotIcon from "@/components/ui/BotIcon";
import api from "@/lib/api";
import { socialMediaApi } from "@/services/socialMediaApi";

interface DashboardProps {
  isAuthenticated: boolean;
}

interface Workflow {
  id: number;
  name: string;
  status: "active" | "paused" | "error";
  business_id: string;
}

interface SocialMediaStats {
  pendingCount: number;
  approvedCount: number;
  publishedCount: number;
  totalCount: number;
  recentPendingPosts: Array<{
    id: number;
    platform: string;
    caption: string;
    status: string;
    scheduled_time?: string;
  }>;
  recentPublishedPosts: Array<{
    id: number;
    platform: string;
    caption: string;
    published_at?: string;
  }>;
}

const Dashboard = ({ isAuthenticated }: DashboardProps) => {
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState({
    name: "User",
    avatar: "",
  });

  const [metrics, setMetrics] = useState({
    systemActivity: 120,
    responseTime: 1.2,
    successRate: 98,
  });

  // State for user workflows
  const [userWorkflows, setUserWorkflows] = useState<Workflow[]>([]);
  const [activeWorkflowsCount, setActiveWorkflowsCount] = useState(0);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(true);

  // State for social media posts
  const [socialMediaStats, setSocialMediaStats] = useState<SocialMediaStats>({
    pendingCount: 0,
    approvedCount: 0,
    publishedCount: 0,
    totalCount: 0,
    recentPendingPosts: [],
    recentPublishedPosts: [],
  });
  const [isLoadingSocial, setIsLoadingSocial] = useState(true);

  // Fetch user workflows
  useEffect(() => {
    const fetchUserWorkflows = async () => {
      try {
        // First get current user to get their ID
        const userResponse = await api.get("/api/users/me");
        const userId = userResponse.data.id;
        
        // Then fetch workflows for this user
        const response = await api.get(`/workflows/user/${userId}`);
        setUserWorkflows(response.data);
        const activeCount = response.data.filter((wf: Workflow) => wf.status === "active").length;
        setActiveWorkflowsCount(activeCount);
      } catch (error) {
        console.error("Failed to load workflows", error);
      } finally {
        setIsLoadingWorkflows(false);
      }
    };
    
    if (isAuthenticated) fetchUserWorkflows();
  }, [isAuthenticated]);

  // Fetch social media stats
  useEffect(() => {
    const fetchSocialMediaStats = async () => {
      try {
        // Get pending posts count
        const pendingResponse = await socialMediaApi.getPendingCount();
        const pendingCount = pendingResponse.pending_count || 0;
        
        // Get all posts to calculate totals
        const allPosts = await socialMediaApi.getPosts();
        const totalCount = allPosts.length;
        
        // Get published/approved posts
        const publishedPosts = await socialMediaApi.getPosts('published');
        const approvedPosts = await socialMediaApi.getPosts('approved');
        const publishedCount = publishedPosts.length;
        const approvedCount = approvedPosts.length;
        
        // Get recent pending posts (last 3)
        const pendingPosts = await socialMediaApi.getPosts('pending');
        const recentPendingPosts = pendingPosts.slice(0, 3).map((post: any) => ({
          id: post.id,
          platform: post.platform,
          caption: post.caption.substring(0, 50) + (post.caption.length > 50 ? '...' : ''),
          status: post.status,
          scheduled_time: post.scheduled_time,
        }));
        
        // Get recent published posts (last 3)
        const recentPublishedPosts = publishedPosts.slice(0, 3).map((post: any) => ({
          id: post.id,
          platform: post.platform,
          caption: post.caption.substring(0, 50) + (post.caption.length > 50 ? '...' : ''),
          published_at: post.published_at || post.approved_at,
        }));
        
        setSocialMediaStats({
          pendingCount,
          approvedCount: approvedCount + publishedCount,
          publishedCount,
          totalCount,
          recentPendingPosts,
          recentPublishedPosts,
        });
      } catch (error) {
        console.error("Failed to load social media stats", error);
        // Use localStorage fallback
        const pendingCount = parseInt(localStorage.getItem('pending_posts_count') || '0', 10);
        setSocialMediaStats(prev => ({
          ...prev,
          pendingCount,
        }));
      } finally {
        setIsLoadingSocial(false);
      }
    };
    
    if (isAuthenticated) fetchSocialMediaStats();
  }, [isAuthenticated]);

  // Listen for updates from social media modules
  useEffect(() => {
    const handlePendingReviewsUpdate = () => {
      // Refresh stats when pending reviews are updated
      const fetchUpdatedStats = async () => {
        try {
          const pendingResponse = await socialMediaApi.getPendingCount();
          const allPosts = await socialMediaApi.getPosts();
          const publishedPosts = await socialMediaApi.getPosts('published');
          const approvedPosts = await socialMediaApi.getPosts('approved');
          
          setSocialMediaStats(prev => ({
            ...prev,
            pendingCount: pendingResponse.pending_count || 0,
            totalCount: allPosts.length,
            approvedCount: approvedPosts.length + publishedPosts.length,
            publishedCount: publishedPosts.length,
          }));
        } catch (error) {
          console.error("Failed to refresh stats", error);
        }
      };
      fetchUpdatedStats();
    };
    
    window.addEventListener('pendingReviewsUpdated', handlePendingReviewsUpdate);
    return () => {
      window.removeEventListener('pendingReviewsUpdated', handlePendingReviewsUpdate);
    };
  }, []);

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await api.get("/api/users/me");
        setCurrentUser({
          name: response.data.username || "User",
          avatar: response.data.profile_picture_url || "",
        });
      } catch (error) {
        console.error("Failed to load user profile", error);
      }
    };

    if (isAuthenticated) fetchUserProfile();
  }, [isAuthenticated]);

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics((prev) => ({
        systemActivity: Math.min(
          prev.systemActivity + Math.floor(Math.random() * 5),
          500,
        ),
        responseTime: Math.max(
          parseFloat(
            (prev.responseTime + (Math.random() - 0.5) * 0.2).toFixed(1),
          ),
          0.5,
        ),
        successRate: Math.min(
          prev.successRate + (Math.random() - 0.5) * 1,
          100,
        ),
      }));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    window.location.href = "/login";
  };

  const featureCards = [
    {
      title: "WhatsApp AI Support",
      description: "AI-powered customer support via WhatsApp",
      icon: MessageSquare,
      metric: "2,543",
      metricLabel: "Chats Managed / Month",
      gradient: "from-whatsapp to-whatsapp/80",
      action: () => navigate("/whatsapp-setup"),
      actionLabel: "Configure Setup",
      chartData: [40, 65, 45, 80, 70, 90],
    },
    {
      title: "Social Media Manager",
      description: "Generate and schedule social content",
      icon: Share2,
      metric: isLoadingSocial ? "..." : `${socialMediaStats.publishedCount} / ${socialMediaStats.pendingCount}`,
      metricLabel: "Published / Pending",
      gradient: "from-social to-social/80",
      action: () => navigate("/social-media-studio"),
      actionLabel: "Launch Studio",
      platforms: ["Instagram", "Facebook", "Twitter", "LinkedIn"],
      showPostsList: true,
      pendingPosts: socialMediaStats.recentPendingPosts,
      publishedPosts: socialMediaStats.recentPublishedPosts,
      totalPosts: socialMediaStats.totalCount,
      approvedCount: socialMediaStats.approvedCount,
      pendingCount: socialMediaStats.pendingCount,
      publishedCount: socialMediaStats.publishedCount,
    },
    {
      title: "Workflow Automation",
      description: "Drag & drop workflow builder",
      icon: GitBranch,
      metric: isLoadingWorkflows ? "..." : activeWorkflowsCount.toString(),
      metricLabel: "Active Workflows",
      gradient: "from-workflow to-workflow/80",
      action: () => navigate("/user-workflows"), 
      actionLabel: "View Workflows",
      userWorkflows: userWorkflows,
      showWorkflowsList: true,
    },
  ];

  const metricCards = [
    {
      title: "System Activity",
      value: metrics.systemActivity,
      label: "Active Users",
      icon: Users,
      change: "+12% from last week",
      positive: true,
      color: "text-info",
      bgColor: "bg-info/10",
    },
    {
      title: "Response Time",
      value: `${metrics.responseTime}s`,
      label: "Average AI Response",
      icon: Zap,
      change: "0.3s faster",
      positive: true,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: "Success Rate",
      value: `${metrics.successRate.toFixed(1)}%`,
      label: "Workflow Completion",
      icon: CheckCircle,
      change: "+2.3% improvement",
      positive: true,
      color: "text-success",
      bgColor: "bg-success/10",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ---------------- Header ---------------- */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-border">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BotIcon size="sm" animated={false} />
            <div>
              <h1 className="text-lg font-bold text-foreground">BizBot</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                AI-Powered Business Automation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link to="/about">
              <Button variant="ghost" size="sm" className="hidden sm:flex">
                About
              </Button>
            </Link>
            <Link to="/contact">
              <Button variant="ghost" size="sm" className="hidden sm:flex">
                Contact
              </Button>
            </Link>

            <button className="relative p-2 rounded-lg hover:bg-accent transition-colors">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
            </button>

            <button
              onClick={() => navigate("/profile")}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={currentUser.avatar} />
                <AvatarFallback className="uppercase font-medium">
                  {currentUser.name.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:block text-sm font-medium">
                {currentUser.name}
              </span>
            </button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* ---------------- Main Content ---------------- */}
      <main className="container mx-auto px-4 py-8">
        {/* Automation Service Cards */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-6">
            Automation Services
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featureCards.map((card, index) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="card-elevated-hover overflow-hidden flex flex-col"
              >
                {/* Card top gradient */}
                <div className={`h-2 bg-gradient-to-r ${card.gradient}`} />

                <div className="p-6 flex flex-col flex-1">
                  {/* Card Icon */}
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-lg bg-gradient-to-br ${card.gradient}`}>
                      <card.icon className="w-6 h-6 text-white" />
                    </div>
                  </div>

                  {/* Card Content */}
                  <h3 className="text-lg font-semibold text-[#1E2361] mb-4">
                    {card.title}
                  </h3>

                  <div className="mb-4">
                    <div className="text-3xl font-bold text-[#1E2361]">{card.metric}</div>
                    <div className="text-sm text-muted-foreground">{card.metricLabel}</div>
                  </div>

                  {/* Optional Charts */}
                  {card.chartData && (
                    <div className="flex items-end gap-1 h-12 mb-4">
                      {card.chartData.map((height, i) => (
                        <div
                          key={i}
                          className={`flex-1 bg-gradient-to-t ${card.gradient} rounded-t opacity-70`}
                          style={{ height: `${height}%` }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Optional Platforms */}
                  {card.platforms && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {card.platforms.map((platform) => (
                        <span
                          key={platform}
                          className="px-2 py-1 text-xs font-medium bg-accent text-accent-foreground rounded-md"
                        >
                          {platform}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Show Social Media Posts List */}
                  {card.showPostsList && (
                    <div className="space-y-3 mb-4">
                      {isLoadingSocial ? (
                        <div className="text-sm text-muted-foreground">Loading posts...</div>
                      ) : (
                        <>
                          {/* Summary Stats */}
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="bg-green-50 rounded-lg p-2 text-center">
                              <div className="text-xl font-bold text-green-600">{card.publishedCount || 0}</div>
                              <div className="text-xs text-green-600">Published</div>
                            </div>
                            <div className="bg-amber-50 rounded-lg p-2 text-center">
                              <div className="text-xl font-bold text-amber-600">{card.pendingCount || 0}</div>
                              <div className="text-xs text-amber-600">Pending</div>
                            </div>
                          </div>
                          
                          {/* Published Posts Section */}
                          {card.publishedPosts && card.publishedPosts.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-green-600 mb-1 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Recently Published
                              </div>
                              {card.publishedPosts.map((post: any) => (
                                <div key={post.id} className="flex items-center gap-2 text-sm py-1">
                                  <div className="w-2 h-2 rounded-full bg-green-500" />
                                  <span className="text-muted-foreground capitalize text-xs">{post.platform}</span>
                                  <span className="text-xs text-muted-foreground truncate flex-1">
                                    {post.caption}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {/* Pending Posts Section */}
                          {card.pendingPosts && card.pendingPosts.length > 0 && (
                            <div>
                              <div className="text-xs font-semibold text-amber-600 mb-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Pending Review
                              </div>
                              {card.pendingPosts.map((post: any) => (
                                <div key={post.id} className="flex items-center gap-2 text-sm py-1">
                                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                                  <span className="text-muted-foreground capitalize text-xs">{post.platform}</span>
                                  <span className="text-xs text-muted-foreground truncate flex-1">
                                    {post.caption}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          
                          {card.pendingPosts.length === 0 && card.publishedPosts.length === 0 && (
                            <div className="text-sm text-muted-foreground text-center py-2">
                              No posts yet
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Show User Workflows List */}
                  {card.showWorkflowsList && card.userWorkflows && (
                    <div className="space-y-2 mb-4">
                      {isLoadingWorkflows ? (
                        <div className="text-sm text-muted-foreground">Loading workflows...</div>
                      ) : card.userWorkflows.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No workflows yet</div>
                      ) : (
                        card.userWorkflows.slice(0, 3).map((wf: Workflow) => (
                          <div key={wf.id} className="flex items-center gap-2 text-sm">
                            <div
                              className={`w-2 h-2 rounded-full ${wf.status === "active" ? "bg-success" : "bg-muted"}`}
                            />
                            <span className="text-muted-foreground">{wf.name}</span>
                          </div>
                        ))
                      )}
                      {card.userWorkflows.length > 3 && (
                        <div className="text-xs text-muted-foreground pl-4">
                          +{card.userWorkflows.length - 3} more
                        </div>
                      )}
                    </div>
                  )}

                  <Button
                    onClick={card.action}
                    variant="ghost"
                    className="w-full justify-between text-[#1E2361] bg-gradient-to-r from-[#F8FAFC] to-[#F1F5F9] hover:from-[#F1F5F9] hover:to-[#E2E8F0] border border-slate-200 mt-auto"
                  >
                    {card.actionLabel}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Real-time Metrics Section */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-foreground mb-6">
            Real-time Performance Metrics
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {metricCards.map((metric, index) => (
              <motion.div
                key={metric.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                className="card-elevated p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-lg ${metric.bgColor}`}>
                    <metric.icon className={`w-5 h-5 ${metric.color}`} />
                  </div>
                </div>

                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  {metric.title}
                </h3>
                <div className="text-3xl font-bold text-foreground mb-1">
                  {metric.value}
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  {metric.label}
                </p>

                <div className="flex items-center gap-1 text-sm">
                  <TrendingUp
                    className={`w-4 h-4 ${metric.positive ? "text-success" : "text-destructive"}`}
                  />
                  <span
                    className={
                      metric.positive ? "text-success" : "text-destructive"
                    }
                  >
                    {metric.change}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="bg-card border-t border-border mt-12">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Company Info */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <BotIcon size="sm" animated={false} />
                <div>
                  <h3 className="font-bold text-foreground">BizBot</h3>
                  <p className="text-xs text-muted-foreground">
                    AI-Powered Business Automation
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                Empowering businesses with intelligent automation solutions.
                Streamline your operations, enhance customer engagement, and
                scale effortlessly.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-semibold text-foreground mb-4">
                Quick Links
              </h4>
              <ul className="space-y-2">
                <li>
                  <Link
                    to="/about"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    About Us
                  </Link>
                </li>
                <li>
                  <Link
                    to="/contact"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Contact Us
                  </Link>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Documentation
                  </a>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold text-foreground mb-4">Contact Us</h4>
              <ul className="space-y-3">
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="w-4 h-4" /> support@bizbot.ai
                </li>
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="w-4 h-4" /> +1 (234) 567-8900
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 mt-0.5" /> 123 Innovation Drive,
                  Tech Valley, CA 94025
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border mt-8 pt-8 text-center">
            <p className="text-sm text-muted-foreground">
              © 2025 BizBot. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Dashboard;