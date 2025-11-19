import jwt from 'jsonwebtoken';
import User from '../models/User.js'; // Đường dẫn model User

// Middleware xác thực token và gắn req.user
export const protect = async (req, res, next) => {
  let token;

  // Kiểm tra xem header Authorization có Bearer token không
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // 1. Lấy token từ header (bỏ chữ "Bearer ")
      token = req.headers.authorization.split(' ')[1];
      console.log("Auth Middleware: Token found:", token ? 'Yes' : 'No');

      // 2. Giải mã token dùng JWT_SECRET
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) throw new Error('JWT Secret not configured');
      const decoded = jwt.verify(token, jwtSecret);
      console.log("Auth Middleware: Token decoded:", decoded); // Sẽ chứa { id: '...', role: '...' }

      // 3. Lấy thông tin user từ DB bằng ID trong token (không lấy password)
      // Giả sử payload token có trường 'id'
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
          console.log("Auth Middleware: User not found for token ID:", decoded.id);
          throw new Error('User not found'); // Kích hoạt catch block
      }
       console.log("Auth Middleware: User attached to req:", req.user.email, req.user.role);

      // 4. Cho phép đi tiếp tới controller
      next();

    } catch (error) {
      console.error('Authentication Error:', error.message);
      res.status(401).json({ message: 'Xác thực thất bại, token không hợp lệ hoặc hết hạn.' });
    }
  }

  // Nếu không có token trong header
  if (!token) {
    console.log("Auth Middleware: No token found in headers.");
    res.status(401).json({ message: 'Chưa đăng nhập, không có quyền truy cập.' });
  }
};

// (Tùy chọn) Middleware kiểm tra role cụ thể (ví dụ: chỉ cho student)
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    // protect middleware phải chạy trước để có req.user
    if (!req.user || !roles.includes(req.user.role)) {
       console.log(`Authorization Failed: User role '${req.user?.role}' not in required roles [${roles.join(', ')}]`);
      return res.status(403).json({ message: 'Bạn không có quyền thực hiện hành động này.' });
    }
    // Nếu role hợp lệ, cho đi tiếp
    next();
  };
};