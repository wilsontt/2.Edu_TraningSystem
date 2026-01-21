export interface QuestionDetail {
  question_id: number;
  question_number: number;
  content: string;
  question_type: string;
  options: string | null;
  correct_answer: string;
  user_answer: string | null;
  is_correct: boolean;
  points: number;
  earned_points: number;
}

export interface ExamHistoryItem {
  id: number;
  submit_time: string | null;
  total_score: number;
  is_passed: boolean;
}

export interface BasicInfo {
  emp_id: string;
  name: string;
  dept_name: string;
  plan_id: number;
  plan_title: string;
  training_date: string | null;
  end_date: string | null;
  passing_score: number;
  total_score: number;
  is_passed: boolean;
  start_time: string | null;
  submit_time: string | null;
  duration: number | null;
  attempts: number;
}

export interface ScoreDetail {
  record_id: number;
  basic_info: BasicInfo;
  question_details: QuestionDetail[];
  history?: ExamHistoryItem[];
}
