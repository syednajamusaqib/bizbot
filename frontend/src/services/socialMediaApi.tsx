const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface SocialPost {
  id: string;
  platform: 'instagram' | 'facebook' | 'twitter' | 'linkedin';
  imageUrl: string;
  caption: string;
  hashtags: string[];
  status: 'pending' | 'approved';
  scheduledTime?: string;
  createdAt: string;
  approvedAt?: string;
  sourceScreen?: 'studio' | 'manual';
}

export interface StudioNotification {
  id: string;
  postId: string;
  platform: string;
  message: string;
  createdAt: string;
  read: boolean;
  type: 'review_needed' | 'approved' | 'scheduled' | 'info';
}

const getAuthToken = () => {
  return localStorage.getItem('access_token');
};

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'An error occurred' }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const socialMediaApi = {
  // Generate AI content
  generateContent: async (topic: string, platforms: string[], tone: string) => {
    const response = await fetch(`${API_BASE_URL}/social-media/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ topic, platforms, tone }),
    });
    return handleResponse(response);
  },

  // Create single post
  createPost: async (post: {
    platform: string;
    image_url?: string;
    caption: string;
    hashtags: string[];
    scheduled_time?: string;
    source: string;
  }) => {
    const response = await fetch(`${API_BASE_URL}/social-media/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(post),
    });
    return handleResponse(response);
  },

  // Create batch posts
  createBatchPosts: async (posts: any[]) => {
    const response = await fetch(`${API_BASE_URL}/social-media/posts/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(posts),
    });
    return handleResponse(response);
  },

  // Get all posts
  getPosts: async (status?: string, platform?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (platform) params.append('platform', platform);
    
    const response = await fetch(`${API_BASE_URL}/social-media/posts?${params}`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });
    return handleResponse(response);
  },

  // Get single post
  getPost: async (postId: number) => {
    const response = await fetch(`${API_BASE_URL}/social-media/posts/${postId}`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });
    return handleResponse(response);
  },

  // Update post
  updatePost: async (postId: number, updates: any) => {
    const response = await fetch(`${API_BASE_URL}/social-media/posts/${postId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify(updates),
    });
    return handleResponse(response);
  },

  // Approve post
  approvePost: async (postId: number) => {
    const response = await fetch(`${API_BASE_URL}/social-media/posts/${postId}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });
    return handleResponse(response);
  },

  // Regenerate post
  regeneratePost: async (postId: number, prompt: string, originalCaption: string, platform: string) => {
    const response = await fetch(`${API_BASE_URL}/social-media/posts/${postId}/regenerate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`,
      },
      body: JSON.stringify({ prompt, original_caption: originalCaption, platform }),
    });
    return handleResponse(response);
  },

  // Delete post
  deletePost: async (postId: number) => {
    const response = await fetch(`${API_BASE_URL}/social-media/posts/${postId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });
    return handleResponse(response);
  },

  // Get pending count
  getPendingCount: async () => {
    const response = await fetch(`${API_BASE_URL}/social-media/posts/pending/count`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });
    return handleResponse(response);
  },

  // Get notifications
  getNotifications: async (unreadOnly: boolean = false) => {
    const response = await fetch(`${API_BASE_URL}/social-media/notifications?unread_only=${unreadOnly}`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });
    return handleResponse(response);
  },

  // Get unread count
  getUnreadCount: async () => {
    const response = await fetch(`${API_BASE_URL}/social-media/notifications/unread/count`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });
    return handleResponse(response);
  },

  // Mark notification as read
  markNotificationRead: async (notificationId: number) => {
    const response = await fetch(`${API_BASE_URL}/social-media/notifications/${notificationId}/read`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });
    return handleResponse(response);
  },

  // Mark all notifications as read
  markAllNotificationsRead: async () => {
    const response = await fetch(`${API_BASE_URL}/social-media/notifications/read-all`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });
    return handleResponse(response);
  },

  // Clear all notifications
  clearAllNotifications: async () => {
    const response = await fetch(`${API_BASE_URL}/social-media/notifications`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
      },
    });
    return handleResponse(response);
  },
};