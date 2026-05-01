"""
題目解析器服務 (Question Parser Service)
負責將特定格式的 TXT 純文字檔案解析成結構化的題目資料 (JSON/Dict)。
支援單選、多選及是非題。
"""

import re
from typing import List, Dict, Optional

class TXTParser:
    """
    解析 TXT 檔案內容以產生考卷題目。
    
    支援格式範例：
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
        """
        核心解析邏輯：將字串內容逐行分析並歸類為題目實體。
        """
        questions = []
        lines = content.splitlines()
        
        current_question = {}
        options = {}
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # 處理題幹 (Question Stem)
            if line.startswith("Q:"):
                # 如果存在上一題，則先執行封裝與儲存
                if current_question:
                    if "content" in current_question and "answer" in current_question:
                        # 1. 處理是非題判定 (無顯式選項且答案為 Y/N 變體)
                        if not options and current_question["answer"].upper() in ['Y', 'N', 'T', 'F', 'YES', 'NO']:
                            current_question["type"] = "true_false"
                            options = {"Y": "是 (Yes)", "N": "否 (No)"}
                            ans = current_question["answer"].upper()
                            if ans in ['T', 'YES']: ans = 'Y'
                            if ans in ['F', 'NO']: ans = 'N'
                            current_question["answer"] = ans
                        
                        # 2. 處理選擇題判定 (依據 ANS 格式區分單選或多選)
                        elif options:
                            ans = current_question["answer"].strip()
                            # 判斷多選：答案含逗號或多個大寫字母連寫 (如 AB)
                            if ',' in ans or (len(ans) > 1 and ans.isalpha() and ans.isupper()):
                                current_question["type"] = "multiple"
                            else:
                                current_question["type"] = "single"
                        
                        else:
                            current_question["type"] = "single"

                        import json
                        current_question["options"] = json.dumps(options, ensure_ascii=False)
                        questions.append(current_question)
                    
                    # 重置暫存器以處理下一題
                    current_question = {}
                    options = {}
                
                current_question["content"] = line[2:].strip()
            
            # 處理選項 (Options) - 支援 A: 選項、B：選項 (全半形)
            elif re.match(r'^[A-Z](:|：)', line):
                key = line[0]
                split_char = ':' if ':' in line[:2] else '：'
                parts = line.split(split_char, 1)
                if len(parts) > 1:
                    options[key] = parts[1].strip()

            # 處理答案 (Answer)
            elif line.startswith("ANS:"):
                current_question["answer"] = line[4:].strip()
            
            # 處理配分 (Score)
            elif line.startswith("SCORE:"):
                try:
                    current_question["points"] = int(line[6:].strip())
                except ValueError:
                    current_question["points"] = 0 
            
            # 處理提示 (Hint)
            elif line.startswith("HINT:") or line.startswith("HINT："):
                hint_text = line[5:].strip() if line.startswith("HINT:") else line[6:].strip()
                current_question["hint"] = hint_text
            
            # 處理難度 (Level)
            elif line.startswith("LEVEL:") or line.startswith("LEVEL：") or line.startswith("Level:") or line.startswith("Level："):
                raw = line.split(":", 1)[-1].split("：", 1)[-1].strip()
                # 標準化為 E/M/H
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

        # 封裝並加入最後一題 (迴圈結束後的殘留資料)
        if current_question and "content" in current_question:
            if "answer" in current_question:
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
        """讀取實體檔案內容並進行解析"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return TXTParser.parse_content(content)
        except Exception as e:
            print(f"Error reading file {file_path}: {e}")
            return []
