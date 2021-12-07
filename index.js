import noblox from 'noblox.js';
import Bottleneck from "bottleneck";
import express from 'express';

const PORT = process.env.PORT || 5000;

const app = express();

app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}}`)
})

noblox.setCookie("***REMOVED***").then(function() { //Use COOKIE from our .env file.
    console.log("Logged in!")
}).catch(function(err) {
    console.log("Unable to log in!", err)
})

const getGroupGamesLimiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 333
})

const limiterManaged = new Bottleneck({
    maxConcurrent: 1,
    minTime: 5
})

let totalRequests = 0

function getGames(group) {
    const getGroupGamesWrap = getGroupGamesLimiter.wrap(noblox.getGroupGames);
    return getGroupGamesWrap(group.Id);
}

function getGroupsGames(groups) {
    let getGamesProms = [];
    for (const group in groups) {
        getGamesProms.push(getGames(groups[group]));
    }
    return Promise.all(getGamesProms)
}

function checkManaged(gameId, userId) {
    const canManageWrap = limiterManaged.wrap(noblox.canManage);
    return canManageWrap(userId, gameId);
}

function checkManagedGames(userId, games) {
    let checkManagedProms = [];
    for (const game in games) {
        checkManagedProms.push(checkManaged(games[game].rootPlace.id, userId));
    }
    return Promise.all(checkManagedProms)
}

function compareManaged(managed, places) {
    return new Promise(resolve => {
        let managedPlaces = [];
        for (const place in places) {
            if (managed[place]) {
                managedPlaces.push(places[place]);
            }
        }
        resolve(managedPlaces)
    })
}

async function getVisits(userId) {
    console.time('getGroups')
    let groups = await noblox.getGroups(userId);
    console.timeEnd('getGroups')
    totalRequests++
    groups = groups.filter(g => g.Rank > 5);
    console.time('getGroupGames')
    let groupGames = await getGroupsGames(groups);
    console.timeEnd('getGroupGames')
    groupGames = groupGames.flat(1);

    groupGames = groupGames.filter(g => g.placeVisits > 500);

    console.time('checkManagedGames')
    const manageBools = await checkManagedGames(userId, groupGames);
    console.timeEnd('checkManagedGames')

    let comparedManaged = await compareManaged(manageBools, groupGames)
    const userGames = await noblox.getPageResults(`//games.roblox.com/v2/users/${userId}/games`, "", 50)

    comparedManaged.concat(userGames)
    const sortedManageGames = comparedManaged.sort((a, b) => {
        return b.placeVisits - a.placeVisits;
    });
    let totalVisits = 0;
    for (const game in sortedManageGames) {
        totalVisits += sortedManageGames[game].placeVisits
    }

    //console.log(sortedManageGames)

    console.log(`totalVisits ${totalVisits}`)
    console.log("Finished")
    return {
        totalVisits: totalVisits,
        games: sortedManageGames.slice(0, 10)
    }
}


app.get("/getPlaceVisits", (req, res, next) => {
    getVisits(req.query.userId).then(visits => {
        res.json(visits);
    })
});