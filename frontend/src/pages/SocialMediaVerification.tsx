/**
 * File: SocialMediaVerification.tsx
 * 
 * Purpose: Verification dashboard for AI-generated social media posts.
 * Posts come from SocialMediaStudio and need approval before publishing.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  Bell,
  Loader2,
  CheckCircle,
  Edit3,
  ArrowLeft,
  Calendar,
  Clock,
  Mail,
  AlertCircle,
  Trash2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { jwtDecode } from "jwt-decode";
import { socialMediaApi } from "@/services/socialMediaApi";

// ==================== TYPES ====================

type Platform = "instagram" | "facebook" | "twitter" | "linkedin";
type PostStatus = "pending" | "approved" | "published";

export interface SocialPost {
  id: string;
  platform: Platform;
  imageUrl: string;
  caption: string;
  hashtags: string[];
  status: PostStatus;
  scheduledTime?: string;
  createdAt: string;
  approvedAt?: string;
  sourceScreen?: "studio" | "manual";
}

interface Notification {
  id: string;
  postId: string;
  platform: Platform;
  message: string;
  createdAt: string;
  read: boolean;
  type: "review_needed" | "approved" | "new_from_studio" | "changes_requested";
}

// ==================== COMPONENT ====================

const SocialMediaVerification: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<"pending" | "approved">("pending");
  const [activePlatform, setActivePlatform] = useState<Platform | "all">("all");
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [reviewPrompt, setReviewPrompt] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isPosting, setIsPosting] = useState<string | null>(null);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [approvedCount, setApprovedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  
  const postRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Get logged-in user email from JWT token
  useEffect(() => {
    const email = getLoggedInUserEmail();
    if (email) {
      setUserEmail(email);
      console.log("User email loaded from token:", email);
    } else {
      console.warn("No user email found in token.");
    }
  }, []);

  // Load counts separately
  const loadCounts = async () => {
    try {
      const pendingResponse = await socialMediaApi.getPendingCount();
      const allPosts = await socialMediaApi.getPosts();
      
      setPendingCount(pendingResponse.pending_count || 0);
      setTotalCount(allPosts.length);
      
      const publishedCount = allPosts.filter((post: any) => 
        post.status === "published" || post.status === "approved"
      ).length;
      setApprovedCount(publishedCount);
    } catch (error) {
      console.error("Failed to load counts:", error);
    }
  };

  // Load posts from backend
  const loadPosts = async () => {
    setIsLoading(true);
    try {
      const status = activeTab === "pending" ? "pending" : "published";
      const response = await socialMediaApi.getPosts(status, activePlatform === "all" ? undefined : activePlatform);
      
      const formattedPosts: SocialPost[] = response.map((post: any) => ({
        id: post.id.toString(),
        platform: post.platform,
        imageUrl: post.image_url || "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&h=600&fit=crop",
        caption: post.caption,
        hashtags: post.hashtags || [],
        status: post.status,
        scheduledTime: post.scheduled_time,
        createdAt: post.created_at,
        approvedAt: post.published_at,
        sourceScreen: post.source === "studio" ? "studio" : "manual",
      }));
      
      setPosts(formattedPosts);
    } catch (error) {
      console.error("Failed to load posts:", error);
      toast.error("Failed to load posts");
    } finally {
      setIsLoading(false);
    }
  };

  // Load notifications from backend
  const loadNotifications = async () => {
    try {
      const response = await socialMediaApi.getNotifications();
      const formattedNotifications: Notification[] = response.map((n: any) => ({
        id: n.id.toString(),
        postId: n.post_id?.toString() || '',
        platform: n.metadata?.platform || 'instagram',
        message: n.message,
        createdAt: n.created_at,
        read: n.read,
        type: n.type,
      }));
      setNotifications(formattedNotifications);
    } catch (error) {
      console.error("Failed to load notifications:", error);
    }
  };

  // Load data on mount and when filters change
  useEffect(() => {
    loadCounts();
    loadPosts();
    loadNotifications();
  }, [activeTab, activePlatform]);

  // Update pending count in localStorage for studio
  const updatePendingCount = async () => {
    try {
      const response = await socialMediaApi.getPendingCount();
      localStorage.setItem('pending_posts_count', response.pending_count.toString());
      window.dispatchEvent(new CustomEvent('pendingReviewsUpdated'));
      setPendingCount(response.pending_count || 0);
    } catch (error) {
      console.error("Failed to get pending count:", error);
    }
  };

  useEffect(() => {
    updatePendingCount();
  }, [posts]);

  // Calculate counts from posts (as backup)
  const pendingCountFromPosts = posts.filter(p => p.status === "pending").length;
  const approvedCountFromPosts = posts.filter(p => p.status === "published" || p.status === "approved").length;

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Listen for new posts from studio
  useEffect(() => {
    const handleNewPosts = (event: CustomEvent) => {
      const newPosts = event.detail as SocialPost[];
      loadCounts(); // Refresh counts
      loadPosts(); // Reload posts to get the latest from backend
      loadNotifications(); // Reload notifications
      
      toast.info(`${newPosts.length} post(s) received for verification`);
    };
    
    window.addEventListener('newPostsForVerification', handleNewPosts as EventListener);
    return () => {
      window.removeEventListener('newPostsForVerification', handleNewPosts as EventListener);
    };
  }, []);

  // Filter posts based on tabs (already filtered by API, but double-check)
  const getFilteredPosts = () => {
    let filtered = posts.filter(post => {
      if (activeTab === "pending") {
        return post.status === "pending";
      } else {
        return post.status === "published" || post.status === "approved";
      }
    });
    
    if (activePlatform !== "all") {
      filtered = filtered.filter(post => post.platform === activePlatform);
    }
    
    return filtered;
  };

  const filteredPosts = getFilteredPosts();

  // ==================== NOTIFICATION HANDLER ====================
  
  const handleNotificationClick = (notification: Notification) => {
    setNotifications((prev) =>
      prev.map((n) => n.id === notification.id ? { ...n, read: true } : n)
    );
    
    // Mark as read in backend
    socialMediaApi.markNotificationRead(parseInt(notification.id)).catch(console.error);
    
    if (notification.type === "approved") {
      setActiveTab("approved");
    } else {
      setActiveTab("pending");
    }
    
    setActivePlatform("all");
    setIsNotificationOpen(false);
    setHighlightedPostId(notification.postId);
    
    setTimeout(() => {
      const postElement = postRefs.current.get(notification.postId);
      if (postElement) {
        postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => setHighlightedPostId(null), 3000);
      }
    }, 100);
  };

  // ==================== POST MANAGEMENT FUNCTIONS ====================

  const handlePostNow = async (post: SocialPost) => {
    setIsPosting(post.id);
    
    try {
      // Approve post via API
      await socialMediaApi.approvePost(parseInt(post.id));
      
      // Update local state
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, status: "published", approvedAt: new Date().toISOString() }
            : p
        )
      );
      
      // Add local notification
      const newNotification: Notification = {
        id: Date.now().toString(),
        postId: post.id,
        platform: post.platform,
        message: `✅ ${post.platform.charAt(0).toUpperCase() + post.platform.slice(1)} post has been published!`,
        createdAt: new Date().toISOString(),
        read: false,
        type: "approved",
      };
      setNotifications((prev) => [newNotification, ...prev]);
      
      // Dispatch event for studio
      window.dispatchEvent(new CustomEvent('postApproved', { 
        detail: { postId: post.id, platform: post.platform } 
      }));
      
      toast.success(`✅ Posted successfully on ${post.platform}!`);
      
      // Refresh counts and posts
      await updatePendingCount();
      await loadCounts();
      await loadPosts();
      
    } catch (error) {
      console.error("Failed to approve post:", error);
      toast.error("Failed to publish post. Please try again.");
    } finally {
      setIsPosting(null);
    }
  };

  const handleOpenReview = (post: SocialPost) => {
    setSelectedPost(post);
    setReviewPrompt(`Improve this ${post.platform} post. Make it more engaging.`);
    setIsReviewModalOpen(true);
  };

  const handleRegenerate = async () => {
    if (!selectedPost) return;
    
    setIsRegenerating(true);
    
    try {
      // Call regenerate API
      const regenerated = await socialMediaApi.regeneratePost(
        parseInt(selectedPost.id),
        reviewPrompt,
        selectedPost.caption,
        selectedPost.platform
      );
      
      // Update local state
      setPosts((prev) =>
        prev.map((p) =>
          p.id === selectedPost.id
            ? {
                ...p,
                caption: regenerated.caption,
                hashtags: regenerated.hashtags,
                status: "pending",
              }
            : p
        )
      );
      
      // Add notification
      const newNotification: Notification = {
        id: Date.now().toString(),
        postId: selectedPost.id,
        platform: selectedPost.platform,
        message: `🔄 ${selectedPost.platform.charAt(0).toUpperCase() + selectedPost.platform.slice(1)} post has been regenerated - needs your review`,
        createdAt: new Date().toISOString(),
        read: false,
        type: "changes_requested",
      };
      setNotifications((prev) => [newNotification, ...prev]);
      
      // Dispatch event for studio
      window.dispatchEvent(new CustomEvent('postNeedsReview', { 
        detail: { postId: selectedPost.id, platform: selectedPost.platform, reason: reviewPrompt } 
      }));
      
      toast.success("Content regenerated! Please review the updated post.");
      
      // Refresh posts and counts
      await loadCounts();
      await loadPosts();
      await updatePendingCount();
      
    } catch (error) {
      console.error("Failed to regenerate post:", error);
      toast.error("Failed to regenerate content. Please try again.");
    } finally {
      setIsRegenerating(false);
      setIsReviewModalOpen(false);
      setSelectedPost(null);
      setReviewPrompt("");
    }
  };

  const handleDeletePost = async (post: SocialPost) => {
    try {
      await socialMediaApi.deletePost(parseInt(post.id));
      setPosts((prev) => prev.filter(p => p.id !== post.id));
      toast.success(`${post.platform} post has been deleted`);
      await updatePendingCount();
      await loadCounts();
    } catch (error) {
      console.error("Failed to delete post:", error);
      toast.error("Failed to delete post");
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await socialMediaApi.markAllNotificationsRead();
      setNotifications((prev) => prev.map(n => ({ ...n, read: true })));
      toast.success("All notifications marked as read");
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  // Get logged-in user email from JWT token
  const getLoggedInUserEmail = (): string | null => {
    try {
      const token = localStorage.getItem("access_token");
      if (!token) return null;
      
      const decoded: any = jwtDecode(token);
      return decoded.email || decoded.sub || decoded.preferred_username || null;
    } catch (error) {
      console.error("Failed to decode token:", error);
      return null;
    }
  };

  // ==================== PLATFORM CONFIGURATION ====================

  const platformConfig: Record<Platform, { icon: React.ReactNode; gradient: string; label: string }> = {
    instagram: {
      icon: <Instagram className="w-5 h-5" />,
      gradient: "from-pink-500 to-orange-400",
      label: "Instagram",
    },
    facebook: {
      icon: <Facebook className="w-5 h-5" />,
      gradient: "from-blue-600 to-blue-400",
      label: "Facebook",
    },
    twitter: {
      icon: <Twitter className="w-5 h-5" />,
      gradient: "from-sky-500 to-sky-400",
      label: "Twitter",
    },
    linkedin: {
      icon: <Linkedin className="w-5 h-5" />,
      gradient: "from-blue-700 to-blue-500",
      label: "LinkedIn",
    },
  };

  if (isLoading && posts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Loading posts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/social-media-studio")}
              className="rounded-full hover:bg-slate-100"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-400 shadow-md">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800">
                  Post Verification Studio
                </h1>
                <p className="text-xs text-slate-500">
                  Review & approve posts before publishing
                </p>
              </div>
            </div>
          </div>

          {/* Right side buttons */}
          <div className="flex items-center gap-3">
            {/* User Email Display */}
            {userEmail && (
              <div className="hidden md:flex items-center gap-1 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-full">
                <Mail className="w-3 h-3" />
                {userEmail}
              </div>
            )}

            {/* Notification Bell */}
            <Popover open={isNotificationOpen} onOpenChange={setIsNotificationOpen}>
              <PopoverTrigger asChild>
                <button className="relative p-2 rounded-full hover:bg-slate-100 transition-colors">
                  <Bell className="w-5 h-5 text-slate-600" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-md">
                      {unreadCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0 shadow-xl border-slate-200" align="end">
                <div className="p-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-slate-800">Notifications</h3>
                    <p className="text-xs text-slate-500">Click to open post</p>
                  </div>
                  {notifications.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={markAllNotificationsRead}
                      className="text-xs"
                    >
                      Mark all read
                    </Button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center">
                      <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">No notifications</p>
                    </div>
                  ) : (
                    notifications.map((notification) => {
                      const platform = platformConfig[notification.platform];
                      return (
                        <div
                          key={notification.id}
                          className={`p-3 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer ${
                            !notification.read ? "bg-indigo-50/30" : ""
                          }`}
                          onClick={() => handleNotificationClick(notification)}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-1.5 rounded-full bg-gradient-to-r ${platform.gradient}`}>
                              {platform.icon}
                            </div>
                            <div className="flex-1">
                              <p className="text-sm text-slate-700">{notification.message}</p>
                              <p className="text-xs text-slate-400 mt-1">
                                {new Date(notification.createdAt).toLocaleString()}
                              </p>
                            </div>
                            {!notification.read && (
                              <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2"></div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="w-full">
          {/* Status Tabs */}
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            <button
              onClick={() => setActiveTab("pending")}
              className={`flex items-center gap-2 py-2 px-6 rounded-xl transition-all duration-200 text-sm font-medium ${
                activeTab === "pending"
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <Clock className="w-4 h-4" />
              Pending Review
              <span className="ml-1 text-xs bg-white/20 px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            </button>
            
            <button
              onClick={() => setActiveTab("approved")}
              className={`flex items-center gap-2 py-2 px-6 rounded-xl transition-all duration-200 text-sm font-medium ${
                activeTab === "approved"
                  ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              <CheckCircle className="w-4 h-4" />
              Published
              <span className="ml-1 text-xs bg-white/20 px-1.5 py-0.5 rounded-full">
                {approvedCount}
              </span>
            </button>
          </div>

          {/* Total Posts Count */}
          <div className="text-center mb-4">
            <span className="text-xs text-slate-400">Total Posts: {totalCount}</span>
          </div>

          {/* Platform Filter Tabs */}
          <div className="flex flex-wrap gap-2 justify-center mb-6 pb-2 border-b border-slate-200">
            <button
              onClick={() => setActivePlatform("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activePlatform === "all"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All Platforms
            </button>
            {Object.entries(platformConfig).map(([key, config]) => (
              <button
                key={key}
                onClick={() => setActivePlatform(key as Platform)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activePlatform === key
                    ? `bg-gradient-to-r ${config.gradient} text-white shadow-sm`
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {config.icon}
                {config.label}
              </button>
            ))}
          </div>

          {/* Posts List - Same as before */}
          <div className="mt-4">
            <AnimatePresence mode="wait">
              {filteredPosts.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl shadow-sm border border-slate-100"
                >
                  {activeTab === "pending" && <Clock className="w-16 h-16 text-amber-400 mb-4" />}
                  {activeTab === "approved" && <CheckCircle className="w-16 h-16 text-emerald-400 mb-4" />}
                  <h3 className="text-xl font-semibold text-slate-700 mb-2">
                    No {activeTab} posts
                  </h3>
                  <p className="text-slate-500">
                    {activeTab === "pending" && "All caught up! No posts waiting for review."}
                    {activeTab === "approved" && "No published posts yet."}
                  </p>
                  {activeTab === "pending" && (
                    <Button
                      onClick={() => navigate("/social-media-studio")}
                      className="mt-6 bg-gradient-to-r from-indigo-600 to-indigo-500"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Create New Post in Studio →
                    </Button>
                  )}
                </motion.div>
              ) : (
                <div className="space-y-6">
                  {filteredPosts.map((post, index) => (
                    <motion.div
                      key={post.id}
                      ref={(el) => {
                        if (el) postRefs.current.set(post.id, el);
                      }}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`bg-white rounded-2xl shadow-md border overflow-hidden hover:shadow-lg transition-all duration-300
                        ${highlightedPostId === post.id 
                          ? "border-indigo-400 ring-2 ring-indigo-400 ring-offset-2" 
                          : "border-slate-100"
                        }`}
                    >
                      {/* Post content - same as before */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                        {/* Image */}
                        <div className="relative h-64 md:h-auto bg-slate-100">
                          <img
                            src={post.imageUrl}
                            alt="Post preview"
                            className="w-full h-full object-cover"
                          />
                          {post.scheduledTime && (
                            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(post.scheduledTime).toLocaleString()}
                            </div>
                          )}
                          {post.sourceScreen === "studio" && (
                            <div className="absolute top-3 right-3 bg-indigo-600 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              From Studio
                            </div>
                          )}
                          <div
                            className={`absolute bottom-3 left-3 px-3 py-1 rounded-full bg-gradient-to-r ${platformConfig[post.platform].gradient} text-white text-xs font-medium flex items-center gap-1 shadow-lg`}
                          >
                            {platformConfig[post.platform].icon}
                            {platformConfig[post.platform].label}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-5 flex flex-col">
                          <div className="flex-1">
                            <div className="mb-4">
                              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                Caption
                              </label>
                              <p className="text-slate-700 mt-1 text-sm leading-relaxed">
                                {post.caption}
                              </p>
                            </div>

                            <div className="mb-4">
                              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                                Hashtags
                              </label>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {post.hashtags.map((tag, i) => (
                                  <span
                                    key={i}
                                    className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {post.scheduledTime && (
                              <div className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Scheduled for: {new Date(post.scheduledTime).toLocaleString()}
                              </div>
                            )}

                            {post.approvedAt && (
                              <div className="text-xs text-slate-400 mt-2">
                                Published: {new Date(post.approvedAt).toLocaleString()}
                              </div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div className="flex gap-2 mt-5 pt-4 border-t border-slate-100">
                            {post.status === "pending" ? (
                              <>
                                <Button
                                  onClick={() => handlePostNow(post)}
                                  disabled={isPosting === post.id}
                                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-md"
                                >
                                  {isPosting === post.id ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : (
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                  )}
                                  Approve & Post
                                </Button>
                                <Button
                                  onClick={() => handleOpenReview(post)}
                                  variant="outline"
                                  className="flex-1 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                                >
                                  <Edit3 className="w-4 h-4 mr-2" />
                                  Request Changes
                                </Button>
                                <Button
                                  onClick={() => handleDeletePost(post)}
                                  variant="outline"
                                  className="border-red-200 text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                onClick={() => handleDeletePost(post)}
                                variant="outline"
                                className="w-full border-red-200 text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Post
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Review Modal - Same as before */}
      <Dialog open={isReviewModalOpen} onOpenChange={setIsReviewModalOpen}>
        <DialogContent className="sm:max-w-lg bg-white rounded-2xl p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Edit3 className="w-5 h-5 text-indigo-500" />
              Request Content Changes
            </DialogTitle>
          </DialogHeader>

          <div className="p-6">
            {selectedPost && (
              <>
                <div className="mb-5 p-3 bg-slate-50 rounded-xl">
                  <p className="text-xs text-slate-500 mb-1">Current Caption:</p>
                  <p className="text-sm text-slate-700">{selectedPost.caption}</p>
                </div>

                <div className="mb-5">
                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                    What would you like to change?
                  </label>
                  <Textarea
                    value={reviewPrompt}
                    onChange={(e) => setReviewPrompt(e.target.value)}
                    placeholder="Example: Make it more professional, add emojis, focus on speed benefits..."
                    className="min-h-[100px] resize-none"
                  />
                </div>

                <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700">
                    AI will regenerate content based on your feedback. The post will go back to pending review status.
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="p-6 pt-0 bg-slate-50 flex gap-3">
            <Button variant="outline" onClick={() => setIsReviewModalOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white"
            >
              {isRegenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Regenerating...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Regenerate Content
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SocialMediaVerification;