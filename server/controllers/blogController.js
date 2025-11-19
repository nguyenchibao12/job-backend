import Blog from '../models/Blog.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import cloudinary from 'cloudinary';

// ========================================
// CONFIG CLOUDINARY
// ========================================
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ========================================
// CREATE BLOG - Admin và Recruiter có thể đăng
// ========================================
export const createBlog = async (req, res) => {
  const authorId = req.user?.id;
  const { title, excerpt, content, category, readTime, image } = req.body;

  console.log(`📝 Create blog request from user: ${authorId}`);

  if (!authorId) {
    return res.status(401).json({ message: "Không xác thực được người dùng." });
  }

  // Kiểm tra quyền: chỉ admin và recruiter được đăng blog
  const user = await User.findById(authorId);
  if (!user || (user.role !== 'admin' && user.role !== 'recruiter')) {
    return res.status(403).json({ message: "Chỉ Admin và Nhà tuyển dụng mới được đăng blog." });
  }

  if (!title || !excerpt || !content || !category) {
    return res.status(400).json({ message: "Vui lòng điền đầy đủ các trường bắt buộc." });
  }

  try {
    let imageUrl = image || '📝';

    // Nếu có ảnh base64, upload lên Cloudinary
    if (image && image.startsWith('data:image')) {
      try {
        const uploadResponse = await cloudinary.v2.uploader.upload(image, {
          folder: 'blog_images',
          resource_type: 'image',
          transformation: [
            { width: 1200, height: 800, crop: 'limit' },
            { quality: 'auto:good' }
          ]
        });
        imageUrl = uploadResponse.secure_url;
        console.log('✅ Blog image uploaded:', imageUrl);
      } catch (uploadError) {
        console.error('❌ Error uploading blog image:', uploadError);
        return res.status(400).json({ message: 'Lỗi khi upload ảnh: ' + uploadError.message });
      }
    }

    const newBlog = new Blog({
      title,
      excerpt,
      content,
      category,
      readTime: readTime || '5 phút',
      image: imageUrl,
      author: authorId,
      status: 'Pending', // Mặc định chờ duyệt
    });

    const savedBlog = await newBlog.save();
    console.log("✅ Blog created with status Pending:", savedBlog._id);

    // Populate author để trả về thông tin tác giả
    await savedBlog.populate('author', 'name email companyName avatar');

    res.status(201).json({
      message: "Tạo blog thành công! Blog đang chờ Admin duyệt.",
      blog: savedBlog,
    });

  } catch (error) {
    console.error("❌ Error creating blog:", error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: "Lỗi máy chủ khi tạo blog.", error: error.message });
  }
};

// ========================================
// GET ALL APPROVED BLOGS - Public
// ========================================
export const getAllApprovedBlogs = async (req, res) => {
  console.log("Public request: Get all approved blogs");

  const { category, search } = req.query;
  const queryFilter = { status: 'Approved' };

  if (category && category !== 'all') {
    queryFilter.category = category;
  }

  if (search) {
    queryFilter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { excerpt: { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } }
    ];
  }

  try {
    const blogs = await Blog.find(queryFilter)
      .populate('author', 'name email companyName avatar')
      .sort({ publishedAt: -1, createdAt: -1 });

    console.log(`✅ Found ${blogs.length} approved blogs`);

    res.status(200).json(blogs);

  } catch (error) {
    console.error("❌ Error getting approved blogs:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy danh sách blog.", error: error.message });
  }
};

// ========================================
// GET BLOG BY ID - Public
// ========================================
export const getBlogById = async (req, res) => {
  const { blogId } = req.params;
  const token = req.headers.authorization?.split(" ")[1];

  let userRole = 'guest';
  let userId = null;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      userRole = decoded.role;
      userId = decoded.id;
    } catch {
      console.log("⚠️ Token không hợp lệ hoặc hết hạn");
    }
  }

  if (!mongoose.Types.ObjectId.isValid(blogId)) {
    return res.status(400).json({ message: "ID blog không hợp lệ." });
  }

  try {
    const blog = await Blog.findById(blogId)
      .populate('author', 'name email companyName avatar');

    if (!blog) {
      return res.status(404).json({ message: "Không tìm thấy blog này." });
    }

    // Chỉ admin và tác giả có thể xem blog chưa duyệt
    const authorId = blog.author?._id?.toString() || blog.author?.toString();
    if (blog.status !== 'Approved') {
      if (userRole !== 'admin' && authorId !== userId) {
        return res.status(404).json({ message: "Không tìm thấy blog này hoặc blog chưa được duyệt." });
      }
    }

    // Tăng lượt xem
    blog.views += 1;
    await blog.save();

    return res.status(200).json(blog);
  } catch (error) {
    console.error("❌ Error getting blog by ID:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi tải chi tiết blog." });
  }
};

// ========================================
// GET PENDING BLOGS - Admin lấy blog chờ duyệt
// ========================================
export const getPendingBlogs = async (req, res) => {
  console.log("👨‍💼 Admin request: Get blogs pending approval");

  try {
    const pendingBlogs = await Blog.find({ status: 'Pending' })
      .populate('author', 'name email companyName avatar')
      .sort({ createdAt: 1 });

    console.log(`✅ Found ${pendingBlogs.length} blogs pending approval`);

    res.status(200).json(pendingBlogs);

  } catch (error) {
    console.error("❌ Error getting pending blogs:", error);
    res.status(500).json({ message: "Lỗi khi lấy blog chờ duyệt.", error: error.message });
  }
};

// ========================================
// UPDATE BLOG STATUS - Admin duyệt/từ chối
// ========================================
export const updateBlogStatus = async (req, res) => {
  const { blogId } = req.params;
  const { status, rejectionReason } = req.body;
  const adminId = req.user.id;

  console.log(`👨‍💼 Admin ${adminId} updating blog ${blogId} to status ${status}`);

  if (!mongoose.Types.ObjectId.isValid(blogId)) {
    return res.status(400).json({ message: "ID blog không hợp lệ." });
  }

  const validStatuses = ['Approved', 'Rejected'];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({
      message: "Trạng thái không hợp lệ. Chỉ chấp nhận 'Approved' hoặc 'Rejected'."
    });
  }

  try {
    const blog = await Blog.findById(blogId).populate('author', 'name email');
    if (!blog) {
      return res.status(404).json({ message: "Không tìm thấy blog." });
    }

    if (blog.status !== 'Pending') {
      return res.status(400).json({
        message: `Chỉ có thể duyệt blog đang ở trạng thái 'Pending'. Trạng thái hiện tại: ${blog.status}`
      });
    }

    blog.status = status;
    blog.reviewedBy = adminId;
    blog.reviewedAt = Date.now();

    if (status === 'Approved') {
      blog.publishedAt = Date.now();
    } else if (status === 'Rejected') {
      blog.rejectionReason = rejectionReason || 'Nội dung không phù hợp';
    }

    await blog.save();
    console.log(`✅ Blog ${blogId} ${status} by admin ${adminId}`);

    res.status(200).json({
      message: status === 'Approved'
        ? `Đã duyệt blog thành công!`
        : `Đã từ chối blog.`,
      blog
    });

  } catch (error) {
    console.error("❌ Error updating blog status:", error);
    res.status(500).json({ message: "Lỗi khi cập nhật trạng thái.", error: error.message });
  }
};

// ========================================
// GET MY BLOGS - Admin/Recruiter lấy blog của mình
// ========================================
export const getMyBlogs = async (req, res) => {
  const authorId = req.user?.id;
  console.log(`User request: Get blogs for author: ${authorId}`);

  if (!authorId) {
    return res.status(401).json({ message: "Không xác thực được người dùng." });
  }

  try {
    const blogs = await Blog.find({ author: authorId })
      .populate('author', 'name email companyName avatar')
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${blogs.length} blogs for author ${authorId}`);
    res.status(200).json(blogs);

  } catch (error) {
    console.error("❌ Error getting my blogs:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy danh sách blog.", error: error.message });
  }
};

// ========================================
// DELETE BLOG - Tác giả hoặc Admin có thể xóa
// ========================================
export const deleteBlog = async (req, res) => {
  const { blogId } = req.params;
  const { id: userId, role: userRole } = req.user;

  console.log(`Delete request for blog: ${blogId} by user: ${userId} (Role: ${userRole})`);

  if (!mongoose.Types.ObjectId.isValid(blogId)) {
    return res.status(400).json({ message: "ID blog không hợp lệ." });
  }

  try {
    const blog = await Blog.findById(blogId);
    if (!blog) {
      return res.status(404).json({ message: "Không tìm thấy blog này." });
    }

    if (userRole !== 'admin' && !blog.author.equals(userId)) {
      return res.status(403).json({ message: "Bạn không có quyền xóa blog này." });
    }

    await Blog.findByIdAndDelete(blogId);
    console.log("✅ Blog deleted successfully:", blogId);

    res.status(200).json({ message: "Xóa blog thành công." });

  } catch (error) {
    console.error("❌ Error deleting blog:", error);
    res.status(500).json({ message: "Lỗi máy chủ khi xóa blog.", error: error.message });
  }
};

