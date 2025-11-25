const TILE_SIZE = 63.5; // Radius (approx for 127px height)
const HEX_WIDTH = 110;
const HEX_HEIGHT = 127;
const X_OFFSET = HEX_WIDTH;
const Y_OFFSET = HEX_HEIGHT * 0.75;

class Game {
    constructor() {
        this.board = new Board();
        this.players = [];
        this.currentPlayerIndex = 0;
        this.phase = 'SETUP'; // SETUP, PLACEMENT, GAMEPLAY, END
        this.turn = 1;
        this.scores = {};
        this.selectedPenguin = null;
        this.maxPlayers = 2; // Default to 2 for now
    }

    init() {
        console.log("Game Initialized");

        const totalSelect = document.getElementById('total-players');
        const aiSelect = document.getElementById('ai-count');

        // Update AI options based on total players
        totalSelect.addEventListener('change', () => {
            const total = parseInt(totalSelect.value);
            aiSelect.innerHTML = '';
            for (let i = 0; i < total; i++) {
                const opt = document.createElement('option');
                opt.value = i;
                opt.innerText = `${i}人`;
                aiSelect.appendChild(opt);
            }
            // Add option for all AI? No, usually at least 1 human is good for testing, but let's allow all AI for fun watching.
            const opt = document.createElement('option');
            opt.value = total;
            opt.innerText = `${total}人 (観戦)`;
            aiSelect.appendChild(opt);

            // Default to 1 AI if possible
            if (total > 1) aiSelect.value = 1;
        });

        // Trigger once to set initial state
        totalSelect.dispatchEvent(new Event('change'));

        window.startGame = () => {
            const total = parseInt(document.getElementById('total-players').value);
            const ai = parseInt(document.getElementById('ai-count').value);
            const difficulty = document.getElementById('ai-difficulty').value;

            document.getElementById('start-screen').classList.add('hidden');
            document.getElementById('ui-layer').classList.remove('hidden');
            document.getElementById('board-container').classList.remove('hidden');
            document.getElementById('controls').classList.remove('hidden');

            this.setupGame(total, ai, difficulty);
            this.render();
            this.updateUI();
        };

        document.getElementById('reset-btn').addEventListener('click', () => {
            location.reload();
        });

        document.getElementById('play-again-btn').addEventListener('click', () => {
            location.reload();
        });

        window.showRules = () => {
            document.getElementById('rules-modal').classList.remove('hidden');
        };

        window.hideRules = () => {
            document.getElementById('rules-modal').classList.add('hidden');
        };
    }

    setupGame(numPlayers, aiCount, difficulty) {
        this.maxPlayers = numPlayers;
        this.aiDifficulty = difficulty;
        this.players = [
            { id: 1, color: 'red', penguins: [], score: 0, tilesCollected: 0, name: '赤', isAI: false, eliminated: false },
            { id: 2, color: 'blue', penguins: [], score: 0, tilesCollected: 0, name: '青', isAI: false, eliminated: false }
        ];
        if (numPlayers >= 3) this.players.push({ id: 3, color: 'green', penguins: [], score: 0, tilesCollected: 0, name: '緑', isAI: false, eliminated: false });
        if (numPlayers >= 4) this.players.push({ id: 4, color: 'yellow', penguins: [], score: 0, tilesCollected: 0, name: '黄', isAI: false, eliminated: false });

        // Assign AI status from the back
        for (let i = 0; i < aiCount; i++) {
            const p = this.players[this.players.length - 1 - i];
            p.isAI = true;
            p.name += " (AI)";
        }

        this.scores = {};
        this.players.forEach(p => this.scores[p.id] = 0);

        this.board.generate();
        this.phase = 'PLACEMENT';
        this.currentPlayerIndex = 0;

        this.penguinsPerPlayer = 4;
        if (numPlayers === 3) this.penguinsPerPlayer = 3;
        if (numPlayers === 4) this.penguinsPerPlayer = 2;

        this.checkAITurn();
    }

    checkAITurn() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (currentPlayer.isAI && this.phase !== 'END' && !currentPlayer.eliminated) {
            setTimeout(() => this.makeAIMove(), 800);
        }
    }

    makeAIMove() {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (currentPlayer.eliminated) {
            this.nextTurn();
            return;
        }
        console.log(`AI ${currentPlayer.name} thinking... Phase: ${this.phase} Difficulty: ${this.aiDifficulty}`);

        if (this.phase === 'PLACEMENT') {
            const validTiles = [];
            this.board.tiles.forEach(tile => {
                if (tile.active && tile.fishCount === 1 && !tile.penguin) {
                    validTiles.push(tile);
                }
            });

            if (validTiles.length > 0) {
                // For Strong AI, maybe pick tiles that are not too close to edge? Or just random.
                // Random is fine for placement.
                const target = validTiles[Math.floor(Math.random() * validTiles.length)];
                this.placePenguin(currentPlayer, target);
            }
        } else if (this.phase === 'GAMEPLAY') {
            let bestMove = null;

            if (this.aiDifficulty === 'strong') {
                // Iterative Deepening
                const startTime = Date.now();
                const timeLimit = 2000; // 2 seconds
                let depth = 1;
                let maxDepth = 10; // Safety cap

                // Keep track of best move from previous depth to order moves? (Not implemented yet)

                while (Date.now() - startTime < timeLimit && depth <= maxDepth) {
                    const move = this.getBestMoveAlphaBeta(currentPlayer, depth, startTime, timeLimit);
                    if (move) {
                        bestMove = move;
                        console.log(`Depth ${depth} complete. Best move score: ${move.score}`);
                    }
                    // If we ran out of time inside getBestMoveAlphaBeta, it might return partial result or null.
                    // We should handle that. For now, getBestMoveAlphaBeta checks time.
                    if (Date.now() - startTime >= timeLimit) break;
                    depth++;
                }
                console.log(`AI finished thinking at depth ${depth - 1}`);
            } else {
                // Weak or Normal
                bestMove = this.getBestMoveSimple(currentPlayer);
            }

            if (bestMove) {
                this.selectPenguin(bestMove.penguin.tile);
                setTimeout(() => {
                    this.movePenguin(bestMove.penguin, bestMove.target);
                }, 1000);
            } else {
                console.warn("AI has no moves");
                this.nextTurn();
            }
        }
    }

    getBestMoveSimple(player) {
        let maxScore = -Infinity;
        let bestMove = null;

        for (let penguin of player.penguins) {
            const moves = this.getValidMoves(penguin);
            for (let targetTile of moves) {
                let currentScore = 0;
                if (this.aiDifficulty === 'weak') {
                    currentScore = targetTile.fishCount + Math.random() * 0.5;
                } else {
                    // Normal
                    const originalTile = penguin.tile;
                    originalTile.penguin = null;
                    originalTile.active = false;
                    targetTile.penguin = penguin;
                    penguin.tile = targetTile;

                    const myReachable = this.calculateReachableFish(player);
                    currentScore = myReachable + (targetTile.fishCount * 0.1) + Math.random() * 0.5;

                    penguin.tile = originalTile;
                    targetTile.penguin = null;
                    originalTile.active = true;
                    originalTile.penguin = penguin;
                }

                if (currentScore > maxScore) {
                    maxScore = currentScore;
                    bestMove = { penguin, target: targetTile };
                }
            }
        }
        return bestMove;
    }

    getBestMoveAlphaBeta(player, depth, startTime, timeLimit) {
        let bestScore = -Infinity;
        let bestMove = null;

        const allMoves = this.getAllMoves(player);
        if (allMoves.length === 0) return null;

        // Move ordering: try to pick high fish tiles first
        allMoves.sort((a, b) => b.target.fishCount - a.target.fishCount);

        for (let move of allMoves) {
            if (Date.now() - startTime > timeLimit) break;

            // Apply
            const originalTile = move.penguin.tile;
            const fishGained = originalTile.fishCount;
            originalTile.penguin = null;
            originalTile.active = false;
            move.target.penguin = move.penguin;
            move.penguin.tile = move.target;
            player.score += fishGained;

            // Next player
            const nextPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            const nextPlayer = this.players[nextPlayerIndex];

            const score = this.alphaBeta(nextPlayer, depth - 1, -Infinity, Infinity, false, player.id, startTime, timeLimit);

            // Undo
            player.score -= fishGained;
            move.penguin.tile = originalTile;
            move.target.penguin = null;
            originalTile.active = true;
            originalTile.penguin = move.penguin;

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
                bestMove.score = score; // Save score for debugging
            }
        }
        return bestMove;
    }

    alphaBeta(currentPlayer, depth, alpha, beta, isMaximizingPlayer, maximizingPlayerId, startTime, timeLimit) {
        if (depth === 0 || Date.now() - startTime > timeLimit) {
            return this.evaluateBoard(maximizingPlayerId);
        }

        const allMoves = this.getAllMoves(currentPlayer);

        if (allMoves.length === 0) {
            // No moves, pass turn (effectively)
            // In this game, if you have no moves, you are skipped.
            // So we should recurse with same player? No, next player.
            // But the game logic says "Eliminate".
            // For search, we just treat it as "no change in state, next player's turn".
            // But we need to avoid infinite loops if everyone is stuck.
            // Let's just evaluate.
            return this.evaluateBoard(maximizingPlayerId);
        }

        // Move ordering
        allMoves.sort((a, b) => b.target.fishCount - a.target.fishCount);

        if (isMaximizingPlayer) {
            let maxEval = -Infinity;
            for (let move of allMoves) {
                // Apply
                const originalTile = move.penguin.tile;
                const fishGained = originalTile.fishCount;
                originalTile.penguin = null;
                originalTile.active = false;
                move.target.penguin = move.penguin;
                move.penguin.tile = move.target;
                currentPlayer.score += fishGained;

                const nextIdx = (this.players.indexOf(currentPlayer) + 1) % this.players.length;
                const nextPlayer = this.players[nextIdx];

                // Determine if next player is the maximizing player (us)
                const nextIsMax = (nextPlayer.id === maximizingPlayerId);

                const evalScore = this.alphaBeta(nextPlayer, depth - 1, alpha, beta, nextIsMax, maximizingPlayerId, startTime, timeLimit);
                maxEval = Math.max(maxEval, evalScore);
                alpha = Math.max(alpha, evalScore);

                // Undo
                currentPlayer.score -= fishGained;
                move.penguin.tile = originalTile;
                move.target.penguin = null;
                originalTile.active = true;
                originalTile.penguin = move.penguin;

                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (let move of allMoves) {
                // Apply
                const originalTile = move.penguin.tile;
                const fishGained = originalTile.fishCount;
                originalTile.penguin = null;
                originalTile.active = false;
                move.target.penguin = move.penguin;
                move.penguin.tile = move.target;
                currentPlayer.score += fishGained;

                const nextIdx = (this.players.indexOf(currentPlayer) + 1) % this.players.length;
                const nextPlayer = this.players[nextIdx];

                const nextIsMax = (nextPlayer.id === maximizingPlayerId);

                const evalScore = this.alphaBeta(nextPlayer, depth - 1, alpha, beta, nextIsMax, maximizingPlayerId, startTime, timeLimit);
                minEval = Math.min(minEval, evalScore);
                beta = Math.min(beta, evalScore);

                // Undo
                currentPlayer.score -= fishGained;
                move.penguin.tile = originalTile;
                move.target.penguin = null;
                originalTile.active = true;
                originalTile.penguin = move.penguin;

                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    getAllMoves(player) {
        const allMoves = [];
        for (let penguin of player.penguins) {
            const moves = this.getValidMoves(penguin);
            moves.forEach(target => allMoves.push({ penguin, target }));
        }
        return allMoves;
    }

    getValidMoves(penguin) {
        const moves = [];
        const directions = [
            { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
            { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
        ];

        for (let d of directions) {
            let q = penguin.tile.q + d.q;
            let r = penguin.tile.r + d.r;
            while (true) {
                const targetTile = this.board.getTile(q, r);
                if (!targetTile || !targetTile.active || targetTile.penguin) break; // Blocked
                moves.push(targetTile);
                q += d.q;
                r += d.r;
            }
        }
        return moves;
    }

    evaluateBoard(playerId) {
        const player = this.players.find(p => p.id === playerId);

        // 1. Score Difference
        let scoreDiff = player.score;
        let maxOpponentScore = 0;
        let opponentReachableSum = 0;

        this.players.forEach(p => {
            if (p.id !== playerId) {
                if (p.score > maxOpponentScore) maxOpponentScore = p.score;
                opponentReachableSum += this.calculateReachableFish(p);
            }
        });
        scoreDiff -= maxOpponentScore;

        // 2. Reachable Fish (Territory)
        const myReachable = this.calculateReachableFish(player);

        // 3. Mobility (Number of moves)
        const myMobility = this.getAllMoves(player).length;

        // Weights
        const wScore = 100;
        const wReachable = 10; // Future score potential
        const wMobility = 1; // Don't get stuck
        const wOpponentReachable = -5; // Deny opponent

        return (scoreDiff * wScore) +
            (myReachable * wReachable) +
            (myMobility * wMobility) +
            (opponentReachableSum * wOpponentReachable);
    }

    calculateReachableFish(player) {
        // BFS from all player's penguins
        const queue = [];
        const visited = new Set();
        let totalFish = 0;

        player.penguins.forEach(p => {
            if (p.tile && p.tile.active) {
                queue.push(p.tile);
                visited.add(p.tile.id); // Assuming tile has ID or we use object ref
                // Actually Set with object ref works
            }
        });

        // We need to traverse the graph of ACTIVE tiles
        // Opponent penguins block movement.
        // My penguins also block movement (but we started BFS from them, so we can move AWAY from them)

        // Wait, standard BFS is not enough because movement is straight lines.
        // But "Reachability" usually means "can I get there eventually?".
        // In this game, connectivity is defined by the grid.
        // If I am on an island, I can reach all tiles on that island (unless blocked by narrow passages).
        // A simple flood fill on active, unoccupied tiles is a good approximation of "territory".

        // Re-initialize queue with just the starting positions
        // We treat the current positions as "access points"

        // Better approach:
        // Count all tiles that are connected to ANY of my penguins via a path of empty active tiles.

        const reachableTiles = new Set();
        const q = [];

        player.penguins.forEach(p => {
            q.push(p.tile);
            reachableTiles.add(p.tile);
        });

        while (q.length > 0) {
            const current = q.shift();
            // Add fish count (if it's not the starting tile we are standing on? No, count everything in territory)
            // But we only collect when we LEAVE.
            // It's fine, sum of fish on tiles is a good metric.

            const neighbors = this.board.getNeighbors(current);
            for (let n of neighbors) {
                if (n.active && !n.penguin && !reachableTiles.has(n)) {
                    reachableTiles.add(n);
                    q.push(n);
                }
            }
        }

        // Sum up fish
        reachableTiles.forEach(t => totalFish += t.fishCount);
        return totalFish;
    }

    handleTileClick(q, r) {
        const currentPlayer = this.players[this.currentPlayerIndex];
        if (currentPlayer.isAI || currentPlayer.eliminated) return; // Ignore clicks during AI turn or if eliminated

        const tile = this.board.getTile(q, r);
        if (!tile || !tile.active) return;

        if (this.phase === 'PLACEMENT') {
            if (tile.fishCount === 1 && !tile.penguin) {
                this.placePenguin(currentPlayer, tile);
            }
        } else if (this.phase === 'GAMEPLAY') {
            if (tile.penguin && tile.penguin.owner.id === currentPlayer.id) {
                // Select penguin
                this.selectPenguin(tile);
            } else if (this.selectedPenguin && !tile.penguin) {
                // Try to move
                if (this.board.isValidMove(this.selectedPenguin, tile)) {
                    this.movePenguin(this.selectedPenguin, tile);
                }
            }
        }
    }

    placePenguin(player, tile) {
        const penguin = new Penguin(player);
        tile.penguin = penguin;
        player.penguins.push(penguin);
        penguin.tile = tile; // Link back

        // Check if placement is done
        this.nextTurn();
        this.render();
        this.updateUI();
    }

    selectPenguin(tile) {
        // Deselect if clicking same
        if (this.selectedPenguin && this.selectedPenguin.tile === tile) {
            this.selectedPenguin = null;
        } else {
            if (tile.penguin && tile.penguin.owner === this.players[this.currentPlayerIndex]) {
                this.selectedPenguin = tile.penguin;
            }
        }
        this.render();
        this.updateUI();
    }

    movePenguin(penguin, targetTile) {
        const startTile = penguin.tile;

        // 1. Remove penguin from start tile
        startTile.penguin = null;

        // 2. Add score to player
        penguin.owner.score += startTile.fishCount;
        penguin.owner.tilesCollected++;

        // 3. Deactivate start tile (it sinks)
        startTile.active = false;

        // 4. Place penguin on new tile
        targetTile.penguin = penguin;
        penguin.tile = targetTile;

        this.selectedPenguin = null;

        // Check for game over or next turn
        this.nextTurn();
        this.render();
        this.updateUI();

        this.checkGameOver();
    }

    eliminatePlayer(player) {
        if (player.eliminated) return;

        console.log(`Player ${player.name} has no moves. Skipping turn.`);
        // Do NOT remove penguins. They stay as obstacles.
        // Just mark as eliminated from *active play* for this round? 
        // Or just skip them in nextTurn?
        // The requirement is "keep them on board".
        // If we mark `eliminated = true`, we need to ensure we don't remove them.
        player.eliminated = true;
    }

    nextTurn() {
        // In placement phase, we loop until all penguins are placed
        if (this.phase === 'PLACEMENT') {
            let allPlaced = true;
            for (let p of this.players) {
                if (p.penguins.length < this.penguinsPerPlayer) {
                    allPlaced = false;
                    break;
                }
            }
            if (allPlaced) {
                this.phase = 'GAMEPLAY';
                this.currentPlayerIndex = 0;
            } else {
                this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            }
        } else {
            // Gameplay phase
            // Check if ANY player can move. If no one can move, game over.
            let anyMovePossible = false;
            for (let p of this.players) {
                if (this.playerCanMove(p)) {
                    anyMovePossible = true;
                    break;
                }
            }

            if (!anyMovePossible) {
                this.phase = 'END';
                this.checkGameOver();
                return;
            }

            // Find next player who can move
            let nextIndex = this.currentPlayerIndex;
            let foundMovablePlayer = false;
            let loopCount = 0;

            while (loopCount < this.players.length) {
                nextIndex = (nextIndex + 1) % this.players.length;
                const nextPlayer = this.players[nextIndex];

                if (this.playerCanMove(nextPlayer)) {
                    this.currentPlayerIndex = nextIndex;
                    foundMovablePlayer = true;
                    // Un-eliminate if they somehow got moves back? (Unlikely in this game)
                    nextPlayer.eliminated = false;
                    break;
                } else {
                    // Player cannot move. Mark as eliminated if not already, but don't remove penguins.
                    if (!nextPlayer.eliminated) {
                        this.eliminatePlayer(nextPlayer);
                    }
                }
                loopCount++;
            }
        }

        this.checkAITurn();
    }

    playerCanMove(player) {
        // Check if player has ANY valid move for ANY penguin
        for (let penguin of player.penguins) {
            if (!penguin.tile) continue;
            const neighbors = this.board.getNeighbors(penguin.tile);
            for (let n of neighbors) {
                if (n.active && !n.penguin) return true;
            }
        }
        return false;
    }

    checkGameOver() {
        if (this.phase === 'END') {
            this.showGameOver();
        }
    }

    showGameOver() {
        const modal = document.getElementById('game-over-modal');
        const scoresDiv = document.getElementById('final-scores');
        modal.classList.remove('hidden');

        let html = '<ul>';
        // Sort by score, then by tiles collected
        const sortedPlayers = [...this.players].sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            } else {
                return b.tilesCollected - a.tilesCollected;
            }
        });

        sortedPlayers.forEach(p => {
            html += `<li>${p.name}: ${p.score} 匹 (タイル: ${p.tilesCollected}枚)</li>`;
        });
        html += '</ul>';
        scoresDiv.innerHTML = html;
    }

    updateUI() {
        const turnInd = document.getElementById('turn-indicator');
        const phaseInd = document.getElementById('phase-indicator');
        const scoreBoard = document.getElementById('scoreboard');

        const currentPlayer = this.players[this.currentPlayerIndex];
        turnInd.innerText = `${currentPlayer.name}の番`;
        turnInd.style.color = getComputedStyle(document.documentElement).getPropertyValue(`--p${currentPlayer.id}-color`);

        if (this.phase === 'PLACEMENT') {
            phaseInd.innerText = 'ペンギンを魚が1つのタイルに配置してください';
        } else if (this.phase === 'GAMEPLAY') {
            if (this.selectedPenguin) {
                phaseInd.innerText = 'ペンギンを動かしてください';
            } else {
                phaseInd.innerText = '動かすペンギンを選んでください';
            }
        } else {
            phaseInd.innerText = '魚を集めてください！';
        }

        let scoreHtml = '';
        this.players.forEach(p => {
            scoreHtml += `<div style="color: var(--p${p.id}-color)">${p.name}: ${p.score}</div>`;
        });
        scoreBoard.innerHTML = scoreHtml;
    }

    render() {
        const boardEl = document.getElementById('game-board');
        boardEl.innerHTML = ''; // Clear (inefficient but simple for now)

        // Render tiles
        this.board.tiles.forEach(tile => {
            if (!tile.active) return;

            const el = document.createElement('div');
            el.className = 'hex-tile';

            // Calculate pixel position
            // Axial to pixel:
            // x = size * (3/2 * q)
            // y = size * (sqrt(3)/2 * q + sqrt(3) * r)
            // But we want "pointy topped" or "flat topped"?
            // Image shows pointy topped.
            // Pointy topped:
            // x = size * sqrt(3) * (q + r/2)
            // y = size * 3/2 * r

            // Let's use the offsets defined at top
            // Using "odd-r" offset coordinates for storage, but axial for math is easier.
            // Let's stick to the Board.generate logic which will likely use offset coords.
            // Let's assume tile.q and tile.r are Axial coordinates.

            // Pointy topped hexes
            const x = TILE_SIZE * Math.sqrt(3) * (tile.q + tile.r / 2);
            const y = TILE_SIZE * 3 / 2 * tile.r;

            el.style.left = `${x + 400}px`; // Center offset
            el.style.top = `${y + 100}px`;

            // Set background image based on fish count
            el.style.backgroundImage = `url('assets/tile${tile.fishCount}.png')`;

            // Highlight valid moves if penguin selected
            if (this.selectedPenguin && this.board.isValidMove(this.selectedPenguin, tile)) {
                el.classList.add('highlighted');
            }

            el.onclick = () => this.handleTileClick(tile.q, tile.r);

            // Set fish count for CSS styling
            el.setAttribute('data-fish', tile.fishCount);

            // Render penguin if present
            if (tile.penguin) {
                const pEl = document.createElement('div');
                pEl.className = 'penguin';
                // Map player color to asset
                let assetName = `penguin_${tile.penguin.owner.color}.png`;
                pEl.style.backgroundImage = `url('assets/${assetName}')`;

                // Remove filters as we now have specific assets
                pEl.style.filter = 'none';

                if (this.selectedPenguin === tile.penguin) {
                    el.classList.add('selected');
                }

                el.appendChild(pEl);
            }

            boardEl.appendChild(el);
        });
    }
}

class Board {
    constructor() {
        this.tiles = new Map(); // key: "q,r", value: Tile
    }

    getTile(q, r) {
        return this.tiles.get(`${q},${r}`);
    }

    generate() {
        this.tiles.clear();
        // Generate 8-7-8-7-8-7-8-7 rows
        // Using "odd-r" offset coordinates converted to axial
        // Rows 0 to 7
        const rows = 8;

        // Distribution: 30x 1-fish, 20x 2-fish, 10x 3-fish. Total 60.
        let fishDeck = [];
        for (let i = 0; i < 30; i++) fishDeck.push(1);
        for (let i = 0; i < 20; i++) fishDeck.push(2);
        for (let i = 0; i < 10; i++) fishDeck.push(3);

        // Shuffle
        for (let i = fishDeck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [fishDeck[i], fishDeck[j]] = [fishDeck[j], fishDeck[i]];
        }

        let fishIdx = 0;

        for (let row = 0; row < rows; row++) {
            const cols = (row % 2 === 0) ? 8 : 7;
            for (let col = 0; col < cols; col++) {
                // Convert offset (col, row) to axial (q, r)
                // For odd-r layout:
                // q = col - (row - (row&1)) / 2
                // r = row
                const q = col - (row - (row & 1)) / 2;
                const r = row;

                if (fishIdx < fishDeck.length) {
                    const tile = new Tile(q, r, fishDeck[fishIdx++]);
                    this.tiles.set(`${q},${r}`, tile);
                }
            }
        }
    }

    getNeighbors(tile) {
        const directions = [
            { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
            { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
        ];
        const neighbors = [];
        for (let d of directions) {
            const n = this.getTile(tile.q + d.q, tile.r + d.r);
            if (n) neighbors.push(n);
        }
        return neighbors;
    }

    isValidMove(penguin, targetTile) {
        if (!targetTile.active || targetTile.penguin) return false; // Cannot move to missing or occupied tile

        const startTile = penguin.tile;
        const dq = targetTile.q - startTile.q;
        const dr = targetTile.r - startTile.r;
        const ds = -dq - dr;

        // Check if straight line: one of the coords must be constant, so delta is 0
        // In axial: 
        // q is constant -> dq = 0
        // r is constant -> dr = 0
        // s is constant -> dq + dr = 0

        if (!(dq === 0 || dr === 0 || dq === -dr)) return false;

        // Check for obstacles
        const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
        const stepQ = dq === 0 ? 0 : dq / dist;
        const stepR = dr === 0 ? 0 : dr / dist;

        let currentQ = startTile.q + stepQ;
        let currentR = startTile.r + stepR;

        for (let i = 0; i < dist - 1; i++) {
            const tile = this.getTile(currentQ, currentR);
            if (!tile || !tile.active || tile.penguin) return false; // Blocked
            currentQ += stepQ;
            currentR += stepR;
        }

        return true;
    }
}

class Tile {
    constructor(q, r, fishCount) {
        this.q = q;
        this.r = r;
        this.fishCount = fishCount;
        this.penguin = null;
        this.active = true;
    }
}

class Penguin {
    constructor(owner) {
        this.owner = owner;
        this.tile = null;
    }
}

const game = new Game();
window.onload = () => game.init();
