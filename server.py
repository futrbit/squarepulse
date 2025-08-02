from flask import Flask, jsonify, request, send_from_directory
import json
import os

app = Flask(__name__, static_folder="static")

@app.route("/")
def serve_index():
    return send_from_directory("static", "index.html")

@app.route("/leaderboard", methods=["GET"])
def get_leaderboard():
    try:
        with open("leaderboard.json", "r") as f:
            return jsonify(json.load(f))
    except:
        return jsonify({"Endless": {"daily": [], "weekly": [], "allTime": []}})

@app.route("/submit-score", methods=["POST"])
def submit_score():
    data = request.get_json()
    name = data.get("name", "Guest")
    score = data.get("score", 0)
    mode = data.get("mode", "Endless")
    colored_drags = data.get("coloredDrags", {})
    green_taps = data.get("greenTaps", 0)
    
    # Validate: ~1 point/s for Hard mode
    if score > 1000:  # Prototype cap
        return jsonify({"success": False, "error": "Invalid score"}), 400
    
    try:
        with open("leaderboard.json", "r") as f:
            lb = json.load(f)
    except:
        lb = {"Endless": {"daily": [], "weekly": [], "allTime": []}}
    
    lb.setdefault(mode, {}).setdefault("daily", []).append({
        "name": name, "score": score, "coloredDrags": colored_drags, "greenTaps": green_taps,
        "timestamp": "2025-08-01T19:15:00Z"  # Mock timestamp
    })
    lb[mode]["daily"] = sorted(lb[mode]["daily"], key=lambda x: x["score"], reverse=True)[:100]
    
    with open("leaderboard.json", "w") as f:
        json.dump(lb, f)
    
    rank = len([x for x in lb[mode]["daily"] if x["score"] > score]) + 1
    return jsonify({"success": True, "rank": rank})

if __name__ == "__main__":
    app.run(debug=True, port=5000)