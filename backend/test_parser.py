from app.services.parser import TXTParser
import json

def test_parser():
    sample_text = """
Q: 請問下列何者不是 Python 的資料型態？
A: Integer
B: String
C: Hamburger
D: List
ANS: C
SCORE: 10

Q: HTML 的全名是什麼？
A: Hyper Text Markup Language
B: High Tech Modern Language
C: Home Tool Make Language
D: Hyperlinks and Text Markup Language
ANS: A
SCORE: 20
    """
    
    print("Testing parser with sample text...")
    questions = TXTParser.parse_content(sample_text)
    
    print(f"Parsed {len(questions)} questions.")
    
    for idx, q in enumerate(questions):
        print(f"\nQuestion {idx+1}:")
        print(f"  Content: {q.get('content')}")
        print(f"  Type: {q.get('type')}")
        print(f"  Options: {q.get('options')}")
        print(f"  Answer: {q.get('answer')}")
        print(f"  Points: {q.get('points')}")

    # Validation
    assert len(questions) == 2
    assert questions[0]["answer"] == "C"
    assert questions[1]["points"] == 20
    print("\nTest Passed!")

if __name__ == "__main__":
    test_parser()
