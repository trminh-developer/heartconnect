import emailjs from '@emailjs/browser';

// ĐIỀN CÁC THÔNG SỐ CỦA BẠN VÀO ĐÂY:
const SERVICE_ID: string = 'service_dating_app';
const TEMPLATE_ID: string = 'template_zmtcivw';
const PUBLIC_KEY: string = 'i5qg-l3f5Uw9ACREj';

export const sendOTPEmail = async (toEmail: string, otpCode: string) => {
  if (SERVICE_ID === 'YOUR_SERVICE_ID' || TEMPLATE_ID === 'YOUR_TEMPLATE_ID') {
    console.warn('Bạn chưa cấu hình đủ EmailJS! Đang log OTP ra console thay vì gửi email.');
    console.log(`[EmailJS MOCK] Gửi tới: ${toEmail} | OTP: ${otpCode}`);
    return true; // Giả lập thành công
  }

  try {
    const templateParams = {
      to_email: toEmail,
      otp_code: otpCode,
    };

    const response = await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      templateParams,
      PUBLIC_KEY
    );

    return response.status === 200;
  } catch (error) {
    console.error('Lỗi khi gửi email:', error);
    throw new Error('Không thể gửi email OTP. Vui lòng kiểm tra cấu hình EmailJS.', { cause: error });
  }
};
