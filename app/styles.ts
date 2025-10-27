export default `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
    color: #fff;
    min-height: 100vh;
    padding: 20px;
  }

  .container {
    max-width: 1400px;
    margin: 0 auto;
  }

  h1 {
    text-align: center;
    margin-bottom: 30px;
    font-size: 2.5em;
    background: linear-gradient(45deg, #00f2fe, #4facfe);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .alert {
    background: rgba(0, 255, 100, 0.2);
    border: 1px solid rgba(0, 255, 100, 0.5);
    border-radius: 10px;
    padding: 15px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 15px;
  }

  .warning {
    background: rgba(255, 193, 7, 0.2);
    border: 1px solid rgba(255, 193, 7, 0.5);
  }

  .controls {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    border-radius: 15px;
    padding: 20px;
    margin-bottom: 25px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .input-group {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }

  input, select, button {
    padding: 12px 20px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.1);
    color: white;
    font-size: 14px;
    transition: all 0.3s;
  }

  input::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  button {
    cursor: pointer;
    background: linear-gradient(45deg, #4facfe, #00f2fe);
    border: none;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  button:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 20px rgba(79, 172, 254, 0.4);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .tabs {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    border-bottom: 2px solid rgba(255, 255, 255, 0.1);
  }

  .tab {
    padding: 12px 25px;
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    transition: all 0.3s;
    font-weight: 600;
    position: relative;
    text-transform: none;
    letter-spacing: normal;
  }

  .tab.active {
    color: #00f2fe;
  }

  .tab.active::after {
    content: '';
    position: absolute;
    bottom: -2px;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(45deg, #4facfe, #00f2fe);
  }

  .dashboard {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }

  .card {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    border-radius: 15px;
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .stock-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
  }

  .stock-symbol {
    font-size: 1.5em;
    font-weight: bold;
    color: #4facfe;
  }

  .stock-price {
    font-size: 2em;
    font-weight: bold;
    margin: 10px 0;
  }

  .price-change {
    display: inline-block;
    padding: 5px 10px;
    border-radius: 5px;
    font-weight: bold;
  }

  .positive {
    background: rgba(0, 255, 100, 0.2);
    color: #00ff64;
  }

  .negative {
    background: rgba(255, 0, 100, 0.2);
    color: #ff0064;
  }

  .neutral {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .indicators {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin: 15px 0;
  }

  .indicator {
    background: rgba(255, 255, 255, 0.03);
    padding: 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .indicator-label {
    font-size: 0.85em;
    color: rgba(255, 255, 255, 0.6);
    margin-bottom: 5px;
  }

  .indicator-value {
    font-size: 1.1em;
    font-weight: bold;
  }

  .signal-box {
    margin-top: 20px;
    padding: 15px;
    border-radius: 10px;
    text-align: center;
  }

  .buy-signal {
    background: linear-gradient(45deg, rgba(0, 255, 100, 0.2), rgba(0, 255, 100, 0.1));
    border: 2px solid #00ff64;
  }

  .sell-signal {
    background: linear-gradient(45deg, rgba(255, 0, 100, 0.2), rgba(255, 0, 100, 0.1));
    border: 2px solid #ff0064;
  }

  .hold-signal {
    background: linear-gradient(45deg, rgba(255, 200, 0, 0.2), rgba(255, 200, 0, 0.1));
    border: 2px solid #ffc800;
  }

  .signal-strength {
    display: flex;
    gap: 5px;
    justify-content: center;
    margin-top: 10px;
  }

  .strength-bar {
    width: 30px;
    height: 8px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }

  .strength-bar.filled {
    background: currentColor;
  }

  .watchlist {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    border-radius: 15px;
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    margin-bottom: 20px;
  }

  .watchlist-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    cursor: pointer;
    transition: background 0.3s;
  }

  .watchlist-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .remove-btn {
    background: rgba(255, 0, 100, 0.2);
    color: #ff0064;
    border: 1px solid #ff0064;
    padding: 5px 10px;
    font-size: 0.8em;
  }

  .loading {
    text-align: center;
    padding: 20px;
    color: rgba(255, 255, 255, 0.6);
  }

  .error {
    background: rgba(255, 0, 0, 0.1);
    border: 1px solid rgba(255, 0, 0, 0.3);
    color: #ff6b6b;
    padding: 15px;
    border-radius: 10px;
    margin: 10px 0;
  }

  .screener-results {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    border-radius: 15px;
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .screener-table {
    width: 100%;
    margin-top: 15px;
  }

  .screener-table th,
  .screener-table td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .screener-table th {
    background: rgba(255, 255, 255, 0.05);
    font-weight: 600;
    color: #4facfe;
  }

  .strategy-info {
    background: rgba(79, 172, 254, 0.1);
    border: 1px solid rgba(79, 172, 254, 0.3);
    border-radius: 10px;
    padding: 15px;
    margin-bottom: 20px;
  }

  ul {
    list-style-position: inside;
  }

  @media (max-width: 768px) {
    .dashboard {
      grid-template-columns: 1fr;
    }
    
    h1 {
      font-size: 1.8em;
    }
  }
`;

