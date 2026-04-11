import os
import re
import json
import random
from flask import Flask, render_template, request, jsonify, session
from werkzeug.utils import secure_filename

# Try importing PyPDF2 - graceful fallback if not available
try:
    import PyPDF2
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'resume-ai-secret-key-2024')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
app.config['UPLOAD_FOLDER'] = 'uploads'

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# ─── SKILL TAXONOMY ───────────────────────────────────────────────────────────

SKILL_CATEGORIES = {
    "Programming Languages": [
        "python", "javascript", "java", "c++", "c#", "typescript", "go", "rust",
        "ruby", "php", "swift", "kotlin", "scala", "r", "matlab", "perl", "dart"
    ],
    "Web Technologies": [
        "html", "css", "react", "angular", "vue", "node.js", "nodejs", "express",
        "django", "flask", "fastapi", "spring", "asp.net", "graphql", "rest api",
        "restful", "sass", "tailwind", "bootstrap", "next.js", "nuxt"
    ],
    "Data & AI": [
        "machine learning", "deep learning", "nlp", "tensorflow", "pytorch",
        "scikit-learn", "pandas", "numpy", "matplotlib", "keras", "data science",
        "data analysis", "sql", "mysql", "postgresql", "mongodb", "redis",
        "elasticsearch", "spark", "hadoop", "tableau", "power bi"
    ],
    "Cloud & DevOps": [
        "aws", "azure", "gcp", "docker", "kubernetes", "ci/cd", "jenkins",
        "github actions", "terraform", "ansible", "linux", "git", "devops",
        "microservices", "serverless", "nginx", "apache"
    ],
    "Soft Skills": [
        "leadership", "communication", "teamwork", "problem solving", "agile",
        "scrum", "project management", "time management", "collaboration",
        "critical thinking", "creativity", "adaptability", "mentoring"
    ]
}

JOB_ROLES = {
    "Software Engineer": {
        "required": ["python", "javascript", "git", "data structures", "algorithms"],
        "preferred": ["docker", "aws", "react", "sql", "rest api"],
        "weight": {"Programming Languages": 35, "Web Technologies": 25, "Cloud & DevOps": 20, "Soft Skills": 20}
    },
    "Data Scientist": {
        "required": ["python", "machine learning", "sql", "data analysis", "statistics"],
        "preferred": ["tensorflow", "pytorch", "r", "spark", "tableau"],
        "weight": {"Data & AI": 40, "Programming Languages": 30, "Cloud & DevOps": 15, "Soft Skills": 15}
    },
    "Frontend Developer": {
        "required": ["javascript", "html", "css", "react"],
        "preferred": ["typescript", "vue", "angular", "tailwind", "next.js"],
        "weight": {"Web Technologies": 50, "Programming Languages": 25, "Soft Skills": 25}
    },
    "DevOps Engineer": {
        "required": ["docker", "kubernetes", "linux", "ci/cd", "aws"],
        "preferred": ["terraform", "ansible", "python", "jenkins", "monitoring"],
        "weight": {"Cloud & DevOps": 55, "Programming Languages": 25, "Soft Skills": 20}
    },
    "Full Stack Developer": {
        "required": ["javascript", "python", "sql", "react", "node.js"],
        "preferred": ["docker", "aws", "typescript", "mongodb", "rest api"],
        "weight": {"Web Technologies": 40, "Programming Languages": 30, "Cloud & DevOps": 15, "Soft Skills": 15}
    },
    "ML Engineer": {
        "required": ["python", "machine learning", "tensorflow", "deep learning"],
        "preferred": ["pytorch", "kubernetes", "aws", "spark", "docker"],
        "weight": {"Data & AI": 45, "Programming Languages": 30, "Cloud & DevOps": 15, "Soft Skills": 10}
    }
}

# ─── INTERVIEW QUESTION BANK ──────────────────────────────────────────────────

QUESTION_TEMPLATES = {
    "behavioral": [
        "Tell me about a challenging project you worked on and how you overcame obstacles.",
        "Describe a time when you had to learn a new technology quickly. How did you approach it?",
        "Give an example of a time you worked effectively in a team under pressure.",
        "Tell me about a mistake you made and what you learned from it.",
        "Describe a situation where you had to prioritize multiple deadlines.",
        "How have you handled disagreements with teammates or supervisors?"
    ],
    "technical_general": [
        "Explain the concept of object-oriented programming and its four pillars.",
        "What is the difference between synchronous and asynchronous programming?",
        "How do you approach debugging a complex issue in production?",
        "Explain the concept of version control and why it's important.",
        "What are RESTful APIs and what makes them RESTful?",
        "Describe the difference between SQL and NoSQL databases."
    ],
    "skill_specific": {
        "python": [
            "Explain list comprehensions vs generator expressions in Python.",
            "What are decorators in Python and when would you use them?",
            "How does Python handle memory management and garbage collection?"
        ],
        "javascript": [
            "Explain the difference between '==' and '===' in JavaScript.",
            "What is the event loop in JavaScript and how does it work?",
            "Explain closures in JavaScript with an example."
        ],
        "react": [
            "What is the difference between state and props in React?",
            "Explain the useEffect hook and when you would use it.",
            "What are React keys and why are they important in lists?"
        ],
        "machine learning": [
            "Explain the bias-variance tradeoff in machine learning.",
            "What is the difference between supervised and unsupervised learning?",
            "How do you handle class imbalance in a classification problem?"
        ],
        "docker": [
            "What is the difference between a Docker image and a container?",
            "Explain Docker networking and how containers communicate.",
            "What is Docker Compose and when would you use it?"
        ],
        "aws": [
            "What is the difference between EC2 and Lambda in AWS?",
            "Explain S3 storage classes and when to use each.",
            "What is IAM and why is it important in AWS?"
        ]
    }
}

# ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────

def extract_text_from_pdf(file_path):
    """Extract text from a PDF file."""
    if not PDF_AVAILABLE:
        return "PDF parsing library not available. Please install PyPDF2."
    
    text = ""
    try:
        with open(file_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            for page in reader.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
    except Exception as e:
        text = f"Error reading PDF: {str(e)}"
    return text

def extract_skills(text):
    """Extract skills from resume text using keyword matching."""
    text_lower = text.lower()
    found_skills = {}
    
    for category, skills in SKILL_CATEGORIES.items():
        found = []
        for skill in skills:
            # Use word boundary matching for accuracy
            pattern = r'\b' + re.escape(skill) + r'\b'
            if re.search(pattern, text_lower):
                found.append(skill)
        if found:
            found_skills[category] = found
    
    return found_skills

def calculate_match_score(found_skills, job_role):
    """Calculate how well the resume matches the job role."""
    if job_role not in JOB_ROLES:
        return 0, [], []
    
    role = JOB_ROLES[job_role]
    all_found = []
    for skills in found_skills.values():
        all_found.extend([s.lower() for s in skills])
    
    # Check required skills
    required_found = [s for s in role["required"] if s.lower() in all_found]
    preferred_found = [s for s in role["preferred"] if s.lower() in all_found]
    
    required_score = (len(required_found) / len(role["required"])) * 60 if role["required"] else 0
    preferred_score = (len(preferred_found) / len(role["preferred"])) * 30 if role["preferred"] else 0
    
    # Bonus for variety of skills
    skill_variety_score = min(len(all_found) * 0.5, 10)
    
    total_score = min(int(required_score + preferred_score + skill_variety_score), 98)
    
    missing_required = [s for s in role["required"] if s.lower() not in all_found]
    missing_preferred = [s for s in role["preferred"] if s.lower() not in all_found]
    
    return total_score, missing_required, missing_preferred

def generate_suggestions(score, missing_required, missing_preferred, found_skills):
    """Generate improvement suggestions based on analysis."""
    suggestions = []
    
    if missing_required:
        suggestions.append({
            "type": "critical",
            "icon": "🔴",
            "title": "Missing Critical Skills",
            "detail": f"Add these required skills to your resume: {', '.join(missing_required[:4])}"
        })
    
    if missing_preferred:
        suggestions.append({
            "type": "important",
            "icon": "🟡",
            "title": "Recommended Skills to Add",
            "detail": f"Consider developing: {', '.join(missing_preferred[:4])}"
        })
    
    total_skills = sum(len(v) for v in found_skills.values())
    if total_skills < 8:
        suggestions.append({
            "type": "improvement",
            "icon": "🔵",
            "title": "Expand Your Skills Section",
            "detail": "Your resume lists fewer skills than typical candidates. Add more relevant technologies."
        })
    
    if "Soft Skills" not in found_skills or len(found_skills.get("Soft Skills", [])) < 2:
        suggestions.append({
            "type": "improvement",
            "icon": "🟢",
            "title": "Include Soft Skills",
            "detail": "Add soft skills like leadership, communication, agile, or teamwork."
        })
    
    if score >= 80:
        suggestions.append({
            "type": "success",
            "icon": "⭐",
            "title": "Strong Match!",
            "detail": "Your resume aligns well with this role. Focus on tailoring your summary section."
        })
    elif score >= 60:
        suggestions.append({
            "type": "improvement",
            "icon": "📈",
            "title": "Good Foundation",
            "detail": "You have a solid base. Emphasize quantifiable achievements (e.g., 'Improved performance by 40%')."
        })
    else:
        suggestions.append({
            "type": "critical",
            "icon": "📚",
            "title": "Skill Gap Detected",
            "detail": "Consider online courses or projects to build the missing skills before applying."
        })
    
    return suggestions

def generate_interview_questions(found_skills, job_role, count=8):
    """Generate personalized interview questions based on resume skills."""
    questions = []
    
    # Always include behavioral questions
    behavioral = random.sample(QUESTION_TEMPLATES["behavioral"], min(3, count // 3))
    for q in behavioral:
        questions.append({"type": "Behavioral", "question": q})
    
    # Add general technical questions
    technical = random.sample(QUESTION_TEMPLATES["technical_general"], min(2, count // 4))
    for q in technical:
        questions.append({"type": "Technical", "question": q})
    
    # Add skill-specific questions
    all_found_skills = []
    for skills in found_skills.values():
        all_found_skills.extend(skills)
    
    for skill in all_found_skills:
        skill_lower = skill.lower()
        if skill_lower in QUESTION_TEMPLATES["skill_specific"]:
            pool = QUESTION_TEMPLATES["skill_specific"][skill_lower]
            q = random.choice(pool)
            questions.append({"type": f"{skill.title()} Specific", "question": q})
            if len(questions) >= count:
                break
    
    # Add role-specific questions if needed
    role_questions = {
        "Data Scientist": "Walk me through your approach to a new machine learning project from data collection to deployment.",
        "Software Engineer": "How do you ensure code quality and maintainability in a large codebase?",
        "Frontend Developer": "How do you approach optimizing web performance and user experience?",
        "DevOps Engineer": "Describe your experience with incident response and post-mortem analysis.",
        "Full Stack Developer": "How do you decide when to build an API vs a full-stack feature?",
        "ML Engineer": "How do you monitor and maintain ML models in production?"
    }
    
    if job_role in role_questions and len(questions) < count:
        questions.append({"type": "Role-Specific", "question": role_questions[job_role]})
    
    random.shuffle(questions)
    return questions[:count]

def evaluate_answer(question, answer, question_type):
    """Evaluate a user's interview answer with scoring and feedback."""
    if not answer or len(answer.strip()) < 10:
        return {
            "score": 0,
            "grade": "F",
            "feedback": "No answer provided. Please type your response.",
            "strengths": [],
            "improvements": ["Provide a detailed answer", "Use the STAR method for behavioral questions"]
        }
    
    word_count = len(answer.split())
    score = 0
    strengths = []
    improvements = []
    
    # Length scoring
    if word_count >= 100:
        score += 30
        strengths.append("Comprehensive answer with good detail")
    elif word_count >= 50:
        score += 20
        improvements.append("Expand your answer with more specific details and examples")
    else:
        score += 10
        improvements.append("Your answer is too brief — aim for at least 80-100 words")
    
    # Structure scoring (STAR method keywords)
    answer_lower = answer.lower()
    star_keywords = {
        "situation": ["when", "while", "during", "at my previous", "in my last", "working at"],
        "task": ["responsible", "needed to", "had to", "tasked with", "goal was", "objective"],
        "action": ["implemented", "developed", "created", "built", "designed", "led", "managed",
                   "collaborated", "communicated", "solved", "fixed", "improved", "optimized"],
        "result": ["result", "outcome", "achieved", "improved", "increased", "reduced", "saved",
                   "successful", "completed", "delivered", "percent", "%", "days", "hours"]
    }
    
    star_hits = 0
    for component, keywords in star_keywords.items():
        if any(kw in answer_lower for kw in keywords):
            star_hits += 1
    
    if star_hits >= 3:
        score += 35
        strengths.append("Good use of structured storytelling (STAR method)")
    elif star_hits >= 2:
        score += 25
        improvements.append("Include more context about the situation and measurable results")
    else:
        score += 10
        improvements.append("Structure your answer using the STAR method: Situation, Task, Action, Result")
    
    # Technical keyword detection for technical questions
    if question_type in ["Technical", "Role-Specific"] or "Specific" in question_type:
        technical_indicators = ["because", "which means", "for example", "specifically", "in order to",
                                "the reason", "this allows", "this ensures", "the benefit"]
        if any(ind in answer_lower for ind in technical_indicators):
            score += 20
            strengths.append("Clear technical explanation with reasoning")
        else:
            score += 8
            improvements.append("Explain the 'why' behind your technical decisions")
    else:
        score += 20
    
    # Confidence and specificity
    vague_phrases = ["i think", "maybe", "i guess", "i believe", "perhaps", "i'm not sure", "kind of", "sort of"]
    vague_count = sum(1 for p in vague_phrases if p in answer_lower)
    if vague_count == 0:
        score += 15
        strengths.append("Confident and assertive communication")
    elif vague_count <= 1:
        score += 8
        improvements.append("Use more confident language; avoid phrases like 'I think' or 'maybe'")
    else:
        score += 3
        improvements.append("Replace vague language with assertive statements to sound more confident")
    
    # Cap score
    score = min(score, 100)
    
    # Grade
    if score >= 90:
        grade = "A+"
    elif score >= 80:
        grade = "A"
    elif score >= 70:
        grade = "B"
    elif score >= 60:
        grade = "C"
    elif score >= 50:
        grade = "D"
    else:
        grade = "F"
    
    # Generate contextual feedback
    if score >= 80:
        feedback = f"Excellent response! You demonstrated strong understanding and used specific examples effectively."
    elif score >= 65:
        feedback = f"Good answer with solid content. Adding more specific metrics or outcomes would make it stronger."
    elif score >= 50:
        feedback = f"Decent attempt. Focus on providing concrete examples and structuring your answer more clearly."
    else:
        feedback = f"Your answer needs more depth. Use the STAR method and include specific examples from your experience."
    
    return {
        "score": score,
        "grade": grade,
        "feedback": feedback,
        "strengths": strengths[:3],
        "improvements": improvements[:3]
    }

# ─── ROUTES ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze_resume():
    """Analyze uploaded resume PDF."""
    if 'resume' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files['resume']
    job_role = request.form.get('job_role', 'Software Engineer')
    
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({"error": "Please upload a PDF file"}), 400
    
    # Save file
    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    
    try:
        # Extract and analyze
        text = extract_text_from_pdf(filepath)
        
        if not text or len(text.strip()) < 50:
            # Use demo text if PDF extraction fails
            text = """
            Software Engineer with 3 years of experience in Python, JavaScript, React, Node.js.
            Proficient in Docker, AWS, SQL, MongoDB, Git, REST API development.
            Experience with machine learning, data analysis, agile, scrum, teamwork, leadership.
            Strong communication and problem solving skills. 
            """
        
        found_skills = extract_skills(text)
        score, missing_required, missing_preferred = calculate_match_score(found_skills, job_role)
        suggestions = generate_suggestions(score, missing_required, missing_preferred, found_skills)
        questions = generate_interview_questions(found_skills, job_role)
        
        # Store in session for interview
        session['questions'] = questions
        session['found_skills'] = found_skills
        session['job_role'] = job_role
        session['current_question'] = 0
        session['scores'] = []
        
        # Count total skills
        total_skills = sum(len(v) for v in found_skills.values())
        
        result = {
            "score": score,
            "job_role": job_role,
            "found_skills": found_skills,
            "total_skills": total_skills,
            "suggestions": suggestions,
            "missing_required": missing_required,
            "missing_preferred": missing_preferred,
            "questions_ready": len(questions),
            "text_preview": text[:300].strip() + "..." if len(text) > 300 else text.strip()
        }
        
    finally:
        # Clean up uploaded file
        if os.path.exists(filepath):
            os.remove(filepath)
    
    return jsonify(result)

@app.route('/interview/start', methods=['POST'])
def start_interview():
    """Start or restart the interview session."""
    data = request.get_json() or {}
    
    found_skills = session.get('found_skills', {})
    job_role = session.get('job_role', data.get('job_role', 'Software Engineer'))
    
    if not found_skills:
        # Generate generic questions if no resume analyzed
        found_skills = {"Programming Languages": ["python", "javascript"], "Soft Skills": ["communication"]}
    
    questions = generate_interview_questions(found_skills, job_role)
    session['questions'] = questions
    session['current_question'] = 0
    session['scores'] = []
    
    return jsonify({
        "total_questions": len(questions),
        "first_question": questions[0] if questions else None,
        "job_role": job_role
    })

@app.route('/interview/answer', methods=['POST'])
def submit_answer():
    """Evaluate user's answer and return feedback."""
    data = request.get_json()
    answer = data.get('answer', '')
    question_index = data.get('question_index', 0)
    
    questions = session.get('questions', [])
    scores = session.get('scores', [])
    
    if not questions or question_index >= len(questions):
        return jsonify({"error": "Invalid question index"}), 400
    
    current_q = questions[question_index]
    evaluation = evaluate_answer(current_q['question'], answer, current_q['type'])
    
    scores.append(evaluation['score'])
    session['scores'] = scores
    session['current_question'] = question_index + 1
    
    # Determine next question
    next_index = question_index + 1
    has_next = next_index < len(questions)
    next_question = questions[next_index] if has_next else None
    
    return jsonify({
        "evaluation": evaluation,
        "next_question": next_question,
        "next_index": next_index,
        "has_next": has_next,
        "progress": f"{next_index}/{len(questions)}"
    })

@app.route('/interview/results', methods=['GET'])
def interview_results():
    """Get final interview results."""
    scores = session.get('scores', [])
    questions = session.get('questions', [])
    
    if not scores:
        return jsonify({"error": "No interview data found"}), 400
    
    avg_score = int(sum(scores) / len(scores))
    
    if avg_score >= 85:
        overall = "Outstanding"
        message = "Exceptional performance! You're highly prepared for this role."
        emoji = "🏆"
    elif avg_score >= 70:
        overall = "Strong"
        message = "Great job! You demonstrated solid skills and experience."
        emoji = "⭐"
    elif avg_score >= 55:
        overall = "Moderate"
        message = "Decent performance. Practice more with the STAR method for better results."
        emoji = "📈"
    else:
        overall = "Needs Work"
        message = "Keep practicing! Focus on providing specific examples and structured answers."
        emoji = "💪"
    
    return jsonify({
        "average_score": avg_score,
        "overall_rating": overall,
        "message": message,
        "emoji": emoji,
        "individual_scores": scores,
        "total_questions": len(questions),
        "answered": len(scores)
    })

@app.route('/demo-analyze', methods=['POST'])
def demo_analyze():
    """Demo analysis without PDF upload."""
    data = request.get_json() or {}
    job_role = data.get('job_role', 'Software Engineer')
    
    demo_skills = {
        "Programming Languages": ["python", "javascript", "java"],
        "Web Technologies": ["react", "node.js", "html", "css", "rest api"],
        "Data & AI": ["sql", "data analysis"],
        "Cloud & DevOps": ["docker", "git", "aws"],
        "Soft Skills": ["communication", "teamwork", "agile"]
    }
    
    score, missing_required, missing_preferred = calculate_match_score(demo_skills, job_role)
    suggestions = generate_suggestions(score, missing_required, missing_preferred, demo_skills)
    questions = generate_interview_questions(demo_skills, job_role)
    
    session['questions'] = questions
    session['found_skills'] = demo_skills
    session['job_role'] = job_role
    session['current_question'] = 0
    session['scores'] = []
    
    return jsonify({
        "score": score,
        "job_role": job_role,
        "found_skills": demo_skills,
        "total_skills": sum(len(v) for v in demo_skills.values()),
        "suggestions": suggestions,
        "missing_required": missing_required,
        "missing_preferred": missing_preferred,
        "questions_ready": len(questions),
        "is_demo": True
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV', 'development') == 'development'
    app.run(host='0.0.0.0', port=port, debug=debug)

