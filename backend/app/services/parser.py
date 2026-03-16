import re
from typing import List, Dict, Optional

class TXTParser:
    """
    解析 TXT 檔案內容以產生考卷題目。
    支援以下格式：

    1. 單選題 (Single Choice):
       Q: 這是單選題目內容？
       A: 選項 1
       B: 選項 2
       ANS: A
       SCORE: 10

    2. 多選題 (Multiple Choice):
       Q: 這是多選題目內容？
       A: 選項 1
       B: 選項 2
       C: 選項 3
       ANS: A,C (或 AC)
       SCORE: 10

    3. 是非題 (True/False):
       Q: 這是是非題內容？
       ANS: Y (或 N, T, F, Yes, No)
       SCORE: 10
    """

    @staticmethod
    def parse_content(content: str) -> List[Dict]:
        questions = []
        lines = content.splitlines()
        
        current_question = {}
        options = {}
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            if line.startswith("Q:"):
                # 如果存在上一題，先儲存
                if current_question:
                    # 驗證並加入列表
                    if "content" in current_question and "answer" in current_question:
                        # 1. 處理是非題 (無選項，答案為 Y/N)
                        if not options and current_question["answer"].upper() in ['Y', 'N', 'T', 'F', 'YES', 'NO']:
                            current_question["type"] = "true_false"
                            options = {"Y": "是 (Yes)", "N": "否 (No)"}
                            # 答案標準化
                            ans = current_question["answer"].upper()
                            if ans in ['T', 'YES']: ans = 'Y'
                            if ans in ['F', 'NO']: ans = 'N'
                            current_question["answer"] = ans
                        
                        # 2. 判斷是否有選項
                        elif options:
                            ans = current_question["answer"].strip()
                            # 如果答案包含逗號或長度大於1且為字母組合，視為多選
                            # 例如 "A,B" 或 "AB"
                            if ',' in ans or (len(ans) > 1 and ans.isalpha() and ans.isupper()):
                                current_question["type"] = "multiple"
                            else:
                                current_question["type"] = "single"
                        
                        # 3. 預設單選 (防呆)
                        else:
                            current_question["type"] = "single"

                        import json
                        current_question["options"] = json.dumps(options, ensure_ascii=False)
                        questions.append(current_question)
                    
                    # 重置
                    current_question = {}
                    options = {}
                
                current_question["content"] = line[2:].strip()
                # 預設類型稍後依據選項決定
                
            elif re.match(r'^[A-Z](:|：)', line):
                key = line[0]
                # 處理半形與全形冒號
                split_char = ':' if ':' in line[:2] else '：'
                # 取得選項內容，並移除空白
                parts = line.split(split_char, 1)
                if len(parts) > 1:
                    options[key] = parts[1].strip()

            # 支援數字選項 1. 2. 防呆
            elif line[0:2] in ["1.", "2.", "3.", "4."]:
                key = chr(ord('A') + int(line[0]) - 1)
                options[key] = line[2:].strip()
                
            elif line.startswith("ANS:"):
                current_question["answer"] = line[4:].strip()
            elif line.startswith("SCORE:"):
                try:
                    current_question["points"] = int(line[6:].strip())
                except ValueError:
                    current_question["points"] = 0 # 解析錯誤時預設為 0
            elif line.startswith("HINT:") or line.startswith("HINT："):  # 支援半形和全形冒號
                hint_text = line[5:].strip() if line.startswith("HINT:") else line[6:].strip()
                current_question["hint"] = hint_text
            elif line.startswith("LEVEL:") or line.startswith("LEVEL：") or line.startswith("Level:") or line.startswith("Level："):
                raw = line.split(":", 1)[-1].split("：", 1)[-1].strip()
                # 標準化為 E/M/H（Easy/Medium/Hard 取首字母）
                if raw.upper() in ("E", "M", "H"):
                    current_question["level"] = raw.upper()
                elif raw.lower().startswith("easy"):
                    current_question["level"] = "E"
                elif raw.lower().startswith("medium"):
                    current_question["level"] = "M"
                elif raw.lower().startswith("hard"):
                    current_question["level"] = "H"
                else:
                    current_question["level"] = raw or None

        # 加入最後一題
        if current_question and "content" in current_question:
            if "answer" in current_question: # 確保必要欄位存在
                if not options and current_question["answer"].upper() in ['Y', 'N', 'T', 'F', 'YES', 'NO']:
                    current_question["type"] = "true_false"
                    options = {"Y": "是 (Yes)", "N": "否 (No)"}
                    ans = current_question["answer"].upper()
                    if ans in ['T', 'YES']: ans = 'Y'
                    if ans in ['F', 'NO']: ans = 'N'
                    current_question["answer"] = ans
                elif options:
                    ans = current_question["answer"].strip()
                    if ',' in ans or (len(ans) > 1 and ans.isalpha() and ans.isupper()):
                        current_question["type"] = "multiple"
                    else:
                        current_question["type"] = "single"
                else:
                    current_question["type"] = "single"
                    
                import json
                current_question["options"] = json.dumps(options, ensure_ascii=False)
                questions.append(current_question)

        return questions

    @staticmethod
    def parse_file(file_path: str) -> List[Dict]:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return TXTParser.parse_content(content)
        except Exception as e:
            print(f"Error reading file {file_path}: {e}")
            return []
