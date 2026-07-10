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

/** 授權重考資訊（歷程／詳情顯示用；不含是否已消耗） */
export interface RetakeAuthorizationInfo {
  authorized_by: string;
  authorized_by_name: string;
  authorized_at: string | null;
  reason: string;
}

/** 考試歷程列；舊補資料列可能無 id（無法開詳情） */
export interface ExamHistoryItem {
  id?: number | null;
  submit_time: string | null;
  total_score: number;
  is_passed: boolean;
  retake_authorization?: RetakeAuthorizationInfo | null;
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
  history_id?: number;
  basic_info: BasicInfo;
  question_details: QuestionDetail[];
  history?: ExamHistoryItem[];
  /** 單次歷程詳情（GET /exam/history/{id}）附帶 */
  retake_authorization?: RetakeAuthorizationInfo | null;
}
