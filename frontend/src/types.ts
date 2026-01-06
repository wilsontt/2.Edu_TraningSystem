export interface User {
  emp_id: string;
  name: string;
  role: 'Admin' | 'User';
  dept_name?: string;
  functions: string[];
}

export interface CaptchaData {
  captcha_id: string;
  image: string;
}
export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Department {
  id: number;
  name: string;
  user_count?: number;
}
