/**
 * File: SocialMediaStudio.tsx
 * Author: Areeba Abdullah
 *
 * Purpose: Renders the AI-powered social media content studio, allowing
 *          users to generate, preview, and schedule posts across multiple platforms.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Palette,
  Instagram,
  Facebook,
  Twitter,
  Linkedin,
  Loader2,
  Calendar,
  Image as ImageIcon,
  Eye,
  Trash2,
  Clock,
  Bell,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { socialMediaApi, SocialPost, StudioNotification } from "@/services/socialMediaApi";

interface Platform {
  instagram: boolean;
  facebook: boolean;
  twitter: boolean;
  linkedin: boolean;
}

interface Post {
  platform: string;
  text: string;
  hashtags: string[];
}

interface GeneratedContent {
  image: string;
  posts: Post[];
}

interface ScheduledPost extends Post {
  id: number;
  scheduledDate: string;
  image: string;
}

// Storage keys for local state (will be replaced by backend)
const PENDING_POSTS_KEY = 'pending_posts_count';
const STUDIO_NOTIFICATIONS_KEY = 'studio_notifications';

const SocialMediaStudio = () => {
  const navigate = useNavigate();
  const [contentTopic, setContentTopic] = useState("");
  const [platforms, setPlatforms] = useState<Platform>({
    instagram: false,
    facebook: false,
    twitter: false,
    linkedin: false,
  });
  const [tone, setTone] = useState("excited");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [pendingReviewsCount, setPendingReviewsCount] = useState(0);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [postToSchedule, setPostToSchedule] = useState<Post | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [showScheduledPostsModal, setShowScheduledPostsModal] = useState(false);
  const [notifications, setNotifications] = useState<StudioNotification[]>([]);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Load data from backend
  useEffect(() => {
    loadPendingCount();
    loadNotifications();
    loadScheduledPosts();
  }, []);

  const loadPendingCount = async () => {
    try {
      const response = await socialMediaApi.getPendingCount();
      setPendingReviewsCount(response.pending_count);
    } catch (error) {
      console.error("Failed to load pending count:", error);
      // Fallback to localStorage
      const count = localStorage.getItem(PENDING_POSTS_KEY);
      if (count) setPendingReviewsCount(parseInt(count, 10));
    }
  };

  const loadNotifications = async () => {
    try {
      const response = await socialMediaApi.getNotifications();
      const formattedNotifications: StudioNotification[] = response.map((n: any) => ({
        id: n.id.toString(),
        postId: n.post_id?.toString() || '',
        platform: n.metadata?.platform || '',
        message: n.message,
        createdAt: n.created_at,
        read: n.read,
        type: n.type,
      }));
      setNotifications(formattedNotifications);
    } catch (error) {
      console.error("Failed to load notifications:", error);
      // Fallback to localStorage
      const saved = localStorage.getItem(STUDIO_NOTIFICATIONS_KEY);
      if (saved) setNotifications(JSON.parse(saved));
    }
  };

  const loadScheduledPosts = async () => {
    try {
      const response = await socialMediaApi.getPosts('pending');
      const formatted: ScheduledPost[] = response.map((post: any) => ({
        id: post.id,
        platform: post.platform,
        text: post.caption,
        hashtags: post.hashtags,
        scheduledDate: post.scheduled_time || post.created_at,
        image: post.image_url,
      }));
      setScheduledPosts(formatted);
    } catch (error) {
      console.error("Failed to load scheduled posts:", error);
    }
  };

  // Save notifications to localStorage as backup
  useEffect(() => {
    localStorage.setItem(STUDIO_NOTIFICATIONS_KEY, JSON.stringify(notifications));
  }, [notifications]);

  // Listen for events from verification screen
  useEffect(() => {
    const handlePostApproved = (event: CustomEvent) => {
      const { postId, platform } = event.detail;
      const newNotification: StudioNotification = {
        id: Date.now().toString(),
        postId,
        platform,
        message: `✅ Your ${platform} post has been approved and published!`,
        createdAt: new Date().toISOString(),
        read: false,
        type: "approved",
      };
      setNotifications((prev) => [newNotification, ...prev]);
      toast.success(`🎉 ${platform} post was approved and published!`);
      loadPendingCount(); // Refresh count
    };

    const handlePostNeedsReview = (event: CustomEvent) => {
      const { postId, platform, reason } = event.detail;
      const newNotification: StudioNotification = {
        id: Date.now().toString(),
        postId,
        platform,
        message: `✏️ Your ${platform} post needs review: ${reason || "Changes requested"}`,
        createdAt: new Date().toISOString(),
        read: false,
        type: "review_needed",
      };
      setNotifications((prev) => [newNotification, ...prev]);
      toast.info(`📝 ${platform} post needs your attention - changes requested`);
      loadPendingCount();
    };

    window.addEventListener('postApproved', handlePostApproved as EventListener);
    window.addEventListener('postNeedsReview', handlePostNeedsReview as EventListener);

    return () => {
      window.removeEventListener('postApproved', handlePostApproved as EventListener);
      window.removeEventListener('postNeedsReview', handlePostNeedsReview as EventListener);
    };
  }, []);

  // Check for pending reviews count
  useEffect(() => {
    const updatePendingCount = () => {
      loadPendingCount();
    };
    
    updatePendingCount();
    window.addEventListener('storage', updatePendingCount);
    window.addEventListener('pendingReviewsUpdated', updatePendingCount as EventListener);
    
    return () => {
      window.removeEventListener('storage', updatePendingCount);
      window.removeEventListener('pendingReviewsUpdated', updatePendingCount as EventListener);
    };
  }, []);

  const handlePlatformToggle = (platform: keyof Platform) => {
    setPlatforms((prev) => ({
      ...prev,
      [platform]: !prev[platform],
    }));
  };

  const handleGenerateContent = async () => {
  if (!contentTopic.trim()) {
    toast.error("Please enter a content topic");
    return;
  }

  const selectedPlatforms = Object.keys(platforms).filter(
    (p) => platforms[p as keyof Platform],
  );
  if (selectedPlatforms.length === 0) {
    toast.error("Please select at least one platform");
    return;
  }

  setIsGenerating(true);

  try {
    const response = await socialMediaApi.generateContent(contentTopic, selectedPlatforms, tone);
    
    // Use API response if available
    setGeneratedContent({
      image: response.image_url || "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&h=600&fit=crop",
      posts: response.posts || []
    });
    toast.success("Content generated! Click Schedule to send for review.");
  } catch (error) {
    console.error("API error, using dummy data:", error);
    
    // Fallback to dummy data
    const dummyImage = "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&h=600&fit=crop";
    const dummyPosts = selectedPlatforms.map((platform) => ({
      platform,
      text: `🎉 Check out our new ${contentTopic}! Blazing fast, reliable, and affordable. #LaunchDay #UnlimitedData`,
      hashtags: ["#Innovation", "#LaunchDay", "#UnlimitedData", `#${contentTopic.replace(/\s/g, "")}`],
    }));
    
    setGeneratedContent({
      image: dummyImage,
      posts: dummyPosts
    });
    toast.warning("Using demo content - backend API not available");
  } finally {
    setIsGenerating(false);
  }
};

  const getPlatformIcon = (platform: string) => {
    const icons: Record<string, React.ReactNode> = {
      instagram: <Instagram className="w-5 h-5" />,
      facebook: <Facebook className="w-5 h-5" />,
      twitter: <Twitter className="w-5 h-5" />,
      linkedin: <Linkedin className="w-5 h-5" />,
    };
    return icons[platform];
  };

  const getPlatformColor = (platform: string) => {
    const colors: Record<string, string> = {
      instagram: "from-pink-500 to-orange-400",
      facebook: "from-blue-600 to-blue-400",
      twitter: "from-sky-500 to-sky-400",
      linkedin: "from-blue-700 to-blue-500",
    };
    return colors[platform] || "from-primary to-primary/80";
  };

  // Schedule post using backend API
  // Schedule post using backend API
const handleSchedulePost = async () => {
  if (!selectedDate || !postToSchedule || !generatedContent) return;

  setIsLoading(true);

  try {
    const postData = {
      platform: postToSchedule.platform,
      image_url: generatedContent.image,
      caption: postToSchedule.text,
      hashtags: postToSchedule.hashtags,
      scheduled_time: selectedDate.toISOString(),
      source: "studio",
    };

    const createdPost = await socialMediaApi.createPost(postData);
    
    // Add to local scheduled posts list
    const newLocalPost: ScheduledPost = {
      ...postToSchedule,
      id: createdPost.id,
      scheduledDate: selectedDate.toISOString(),
      image: generatedContent.image,
    };
    
    setScheduledPosts((prev) => [...prev, newLocalPost]);
    
    // REMOVE the scheduled post from generated content
    const updatedPosts = generatedContent.posts.filter(
      (post) => post !== postToSchedule
    );
    
    // If there are no more posts, clear the generated content
    if (updatedPosts.length === 0) {
      setGeneratedContent(null);
    } else {
      setGeneratedContent({
        ...generatedContent,
        posts: updatedPosts
      });
    }
    
    // Update pending reviews count
    await loadPendingCount();
    
    // Send to verification screen via event
    const socialPost: SocialPost = {
      id: createdPost.id.toString(),
      platform: postToSchedule.platform as any,
      imageUrl: generatedContent.image,
      caption: postToSchedule.text,
      hashtags: postToSchedule.hashtags,
      status: "pending",
      scheduledTime: selectedDate.toISOString(),
      createdAt: new Date().toISOString(),
      sourceScreen: "studio",
    };
    
    window.dispatchEvent(new CustomEvent('pendingReviewsUpdated'));
    window.dispatchEvent(new CustomEvent('newPostsForVerification', { detail: [socialPost] }));
    
    toast.success(`Post scheduled for ${selectedDate.toLocaleDateString()} and sent for review!`);
    
    setShowDatePicker(false);
    setPostToSchedule(null);
    setSelectedDate(undefined);
  } catch (error) {
    console.error("Failed to schedule post:", error);
    toast.error("Failed to schedule post. Please try again.");
  } finally {
    setIsLoading(false);
  }
};

  // Delete scheduled post
  const deleteScheduledPost = async (postId: number) => {
    try {
      await socialMediaApi.deletePost(postId);
      setScheduledPosts((prev) => prev.filter(p => p.id !== postId));
      toast.success("Scheduled post deleted");
      await loadPendingCount();
    } catch (error) {
      console.error("Failed to delete post:", error);
      toast.error("Failed to delete post");
    }
  };

  const goToVerification = () => {
    navigate("/social-media-verification");
  };

  const markNotificationAsRead = async (notificationId: string) => {
    try {
      await socialMediaApi.markNotificationRead(parseInt(notificationId));
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, read: true } : n
        )
      );
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const clearAllNotifications = async () => {
    try {
      await socialMediaApi.clearAllNotifications();
      setNotifications([]);
      toast.success("All notifications cleared");
    } catch (error) {
      console.error("Failed to clear notifications:", error);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "approved":
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case "review_needed":
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      case "scheduled":
        return <Calendar className="w-4 h-4 text-blue-500" />;
      default:
        return <Bell className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/dashboard")}
              className="rounded-full hover:bg-slate-100"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-400 shadow-md">
                <Palette className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800">
                  Social Media Content Studio
                </h1>
                <p className="text-xs text-slate-500">
                  Generate & Schedule Posts
                </p>
              </div>
            </div>
          </div>
          
          {/* Right side buttons */}
          <div className="flex items-center gap-3">
            {/* Notifications Bell */}
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
                <div className="p-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white">
                  <h3 className="font-semibold text-slate-800">Notifications</h3>
                  <p className="text-xs text-slate-500">Updates from verification</p>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center">
                      <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">No notifications</p>
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`p-3 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer ${
                          !notification.read ? "bg-indigo-50/30" : ""
                        }`}
                        onClick={() => markNotificationAsRead(notification.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {getNotificationIcon(notification.type)}
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
                    ))
                  )}
                </div>
                <div className="p-2 border-t border-slate-100 bg-slate-50">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={clearAllNotifications}
                  >
                    Clear all
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* View All Scheduled Posts Button */}
            <Popover open={showScheduledPostsModal} onOpenChange={setShowScheduledPostsModal}>
              <PopoverTrigger asChild>
                <button className="relative p-2 rounded-full hover:bg-slate-100 transition-colors">
                  <Calendar className="w-5 h-5 text-slate-600" />
                  {scheduledPosts.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-md">
                      {scheduledPosts.length}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-96 p-0 shadow-xl border-slate-200" align="end">
                <div className="p-3 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-white">
                  <h3 className="font-semibold text-slate-800">All Scheduled Posts</h3>
                  <p className="text-xs text-slate-500">Posts waiting to be reviewed</p>
                </div>
                <div className="max-h-96 overflow-y-auto p-2">
                  {scheduledPosts.length === 0 ? (
                    <div className="p-6 text-center">
                      <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500">No scheduled posts</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {scheduledPosts.map((post) => (
                        <div key={post.id} className="p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-slate-200 flex-shrink-0">
                              {post.image ? (
                                <img src={post.image} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon className="w-5 h-5 text-slate-400 absolute inset-0 m-auto" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {getPlatformIcon(post.platform)}
                                <span className="text-sm font-medium capitalize text-slate-800">{post.platform}</span>
                              </div>
                              <p className="text-xs text-slate-500 truncate">{post.text.substring(0, 50)}...</p>
                              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(post.scheduledDate).toLocaleString()}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteScheduledPost(post.id)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="p-3 border-t border-slate-100 bg-slate-50">
                  <Button
                    onClick={goToVerification}
                    className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 text-white"
                    size="sm"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Go to Verification Screen
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Pending Reviews Button */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="relative p-2 rounded-full hover:bg-slate-100 transition-colors">
                  <Eye className="w-5 h-5 text-slate-600" />
                  {pendingReviewsCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center shadow-md">
                      {pendingReviewsCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="end">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-slate-700">
                    {pendingReviewsCount > 0 
                      ? `${pendingReviewsCount} post(s) pending review` 
                      : "No pending reviews"}
                  </p>
                  <Button
                    onClick={goToVerification}
                    className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 text-white"
                    size="sm"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View All Pending Reviews
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Input */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">
                Content Topic
              </h2>
              <Input
                type="text"
                placeholder="e.g., New Fiber Optic Plans - Launch"
                value={contentTopic}
                onChange={(e) => setContentTopic(e.target.value)}
                className="mb-6"
              />

              <h3 className="text-sm font-medium text-slate-700 mb-3">
                Platforms
              </h3>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {(Object.keys(platforms) as Array<keyof Platform>).map(
                  (platform) => (
                    <button
                      key={platform}
                      onClick={() => handlePlatformToggle(platform)}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                        platforms[platform]
                          ? `bg-gradient-to-r ${getPlatformColor(platform)} text-white border-transparent shadow-md`
                          : "bg-white border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {getPlatformIcon(platform)}
                      <span className="text-sm font-medium capitalize">
                        {platform}
                      </span>
                    </button>
                  ),
                )}
              </div>

              <h3 className="text-sm font-medium text-slate-700 mb-3">
                Desired Tone
              </h3>
              <RadioGroup value={tone} onValueChange={setTone} className="mb-6">
                {["excited", "informative", "professional"].map((t) => (
                  <div key={t} className="flex items-center space-x-2">
                    <RadioGroupItem value={t} id={t} />
                    <Label htmlFor={t} className="capitalize cursor-pointer text-slate-700">
                      {t}
                    </Label>
                  </div>
                ))}
              </RadioGroup>

              <Button
                onClick={handleGenerateContent}
                disabled={isGenerating}
                className="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-700 hover:to-indigo-600 text-white shadow-md transition-all"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Content"
                )}
              </Button>
            </div>
          </motion.div>

          {/* Middle Panel - Generated Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">
                Generated Content
              </h2>

              {isGenerating && (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                  <p className="text-slate-500">AI Generating Content...</p>
                </div>
              )}

              {!isGenerating && generatedContent && (
                <>
                  <div className="rounded-xl overflow-hidden mb-4 shadow-sm">
                    <img
                      src={generatedContent.image}
                      alt="Generated content"
                      className="w-full h-48 object-cover"
                    />
                  </div>

                  <div className="space-y-4">
                    {generatedContent.posts.map((post, index) => (
                      <div
                        key={index}
                        className="p-4 bg-indigo-50/30 rounded-xl border border-indigo-100"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div
                            className={`flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r ${getPlatformColor(post.platform)} text-white text-xs font-medium shadow-sm`}
                          >
                            {getPlatformIcon(post.platform)}
                            <span className="capitalize">{post.platform}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setPostToSchedule(post);
                              setSelectedDate(undefined);
                              setShowDatePicker(true);
                            }}
                            className="text-xs bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-1 rounded-lg"
                            disabled={isLoading}
                          >
                            {isLoading ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <Calendar className="w-3 h-3 mr-1" />
                            )}
                            Schedule
                          </Button>
                        </div>
                        <p className="text-sm text-slate-700 mb-2">
                          {post.text}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {post.hashtags.map((tag, i) => (
                            <span
                              key={i}
                              className="text-xs text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    
                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-xs text-blue-700 flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        <strong>Schedule to Send for Review:</strong>
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        Click "Schedule" on any post - it will be scheduled AND automatically sent to the verification screen for approval.
                      </p>
                    </div>
                  </div>
                </>
              )}

              {!isGenerating && !generatedContent && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Palette className="w-12 h-12 text-indigo-200 mb-4" />
                  <p className="text-slate-500">
                    Enter a topic and generate content to schedule posts
                  </p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Right Panel - Calendar */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-2">
                Content Calendar
              </h2>
              <p className="text-sm text-slate-500 mb-4">
                All Scheduled Posts
              </p>

              {scheduledPosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Calendar className="w-12 h-12 text-indigo-200 mb-4" />
                  <p className="text-slate-500">No scheduled posts yet</p>
                  <p className="text-xs text-slate-400 mt-2">Schedule a post above - it will automatically go to review</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {scheduledPosts.map((post) => (
                    <div
                      key={post.id}
                      className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors group"
                    >
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-slate-100">
                        {post.image ? (
                          <img
                            src={post.image}
                            alt="Post preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-slate-400 absolute inset-0 m-auto" />
                        )}
                        <div
                          className={`absolute bottom-0 right-0 p-1 bg-gradient-to-r ${getPlatformColor(post.platform)} rounded-tl-lg`}
                        >
                          {getPlatformIcon(post.platform)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 capitalize">
                          {post.platform}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(post.scheduledDate).toLocaleString()}
                        </p>
                        <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Pending Review
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteScheduledPost(post.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </main>

      {/* Date Picker Dialog */}
      <Dialog open={showDatePicker} onOpenChange={setShowDatePicker}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Schedule Post</DialogTitle>
            <p className="text-sm text-slate-500 mt-1">
              This post will be scheduled and automatically sent for review
            </p>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <CalendarComponent
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={(date) => date < new Date()}
              className="rounded-md border"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowDatePicker(false);
                setPostToSchedule(null);
                setSelectedDate(undefined);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSchedulePost}
              disabled={!selectedDate || isLoading}
              className="bg-gradient-to-r from-indigo-600 to-indigo-500 text-white"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : selectedDate ? (
                `Schedule for ${selectedDate.toLocaleDateString()}`
              ) : (
                "Pick a Date"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SocialMediaStudio;