from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/squarepulse')
def squarepulse():
    return render_template('square_pulse.html')

@app.route('/monkeydrop')
def monkeydrop():
    return render_template('monkey_drop_smash.html')

if __name__ == '__main__':
    app.run(debug=True)
